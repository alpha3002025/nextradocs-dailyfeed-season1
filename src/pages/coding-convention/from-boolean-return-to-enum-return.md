# boolean 반환형 대신 enum 반환형을 사용

 boolean 반환형 만으로는 함수의 의미나 용도가 모호한 경우가 많습니다. 예를 들면 인증로직에서 어떤 로직이 true/false 를 return 하더라도 Expired 됐다는건지 Not Exipred 라는 것인지 의미가 모호해지는 케이스가 많습니다. 현재 프로젝트에서는 70% 이상의 코드에서 boolean return 대신 Enum 을 return 하도록 구성했습니다. (간단한 boolean return 이더라도 의미가 명확하다면 굳이 Enum 을 사용하지는 않았습니다.)<br/>
 <br/>

e.g. `dailyfeed-member` / `AuthenticationService.java`
```java
// ...

@Slf4j
@RequiredArgsConstructor
@Transactional
@Service
public class AuthenticationService {
	
	// ...
	
    public DailyfeedServerResponse<MemberDto.Member> signup(AuthenticationDto.SignupRequest signupRequest) {
        if (MemberExistsPredicate.EXISTS.equals(checkIfMemberAlreadyExists(signupRequest))) {
            throw new MemberAlreadyExistsException();
        }

        Member newMember = authenticationMapper.newMember(signupRequest, passwordEncoder, "MEMBER");
        Member saved = memberRepository.save(newMember);

        return DailyfeedServerResponse.<MemberDto.Member>builder()
                .status(HttpStatus.CREATED.value())
                .result(ResponseSuccessCode.SUCCESS)
                .data(authenticationMapper.fromMemberEntityToMemberDto(saved))
                .build();
    }
    
    // ...

    @Transactional(readOnly = true)
    public MemberExistsPredicate checkIfMemberAlreadyExists(AuthenticationDto.SignupRequest signupRequest) {
        if (memberRepository.findFirstByEmailFetchJoin(signupRequest.getEmail()).isPresent()) {
            return MemberExistsPredicate.EXISTS;
        }
        return MemberExistsPredicate.NOT_EXISTS;
    }
}
```
<br/>

`dailyfeed-member` / `JwtAuthenticationFilter.java`
```java
// ...
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtKeyHelper jwtKeyHelper;
    private final TokenService tokenService;

    public JwtAuthenticationFilter(
            JwtKeyHelper jwtKeyHelper,
            TokenService tokenService
    ) {
        this.jwtKeyHelper = jwtKeyHelper;
        this.tokenService = tokenService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();

        // ...

        // 블랙리스트 확인
        if (BlackListedPredicate.BLACKLISTED.equals(tokenService.isTokenBlacklisted(jti))) {
            log.debug("Token is blacklisted: JTI={}", jti);
            addReLoginRequiredAtResponseHeader(response);
            return;
        }

        // 토큰 검증 및 사용자 정보 추출
        JwtDto.UserDetails userDetails = jwtKeyHelper.readUserDetailsFromToken(keyId, token);

        // Access Token 만료 확인
        if (JwtExpiredPredicate.EXPIRED.equals(JwtProcessor.checkIfExpired(userDetails.getExpiration()))) {
            // Access Token 만료됨 -> Refresh Token 확인
            boolean hasCookie = hasRefreshTokenCookie(request);

            if (!hasCookie) {
                // 쿠키 없음 (서비스 간 통신) -> 토큰 갱신 필요
                log.debug("Access Token expired, no cookie (service-to-service) - MemberId: {}", userDetails.getId());
                addRefreshNeededAtResponseHeader(response);
                return;
            }

            // 쿠키 있음 (브라우저 요청) -> Refresh Token 검증
            JwtExpiredPredicate refreshTokenStatus = jwtKeyHelper.checkRefreshTokenExpiration(request);

            if (JwtExpiredPredicate.EXPIRED.equals(refreshTokenStatus)) {
                // Refresh Token도 만료됨 -> 재로그인 필요
                log.warn("Both Access and Refresh Token expired - MemberId: {}", userDetails.getId());
                addReLoginRequiredAtResponseHeader(response);
                return;
            }

            // Refresh Token은 유효함 -> Access Token 갱신 필요
            log.debug("Access Token expired, Refresh Token valid - MemberId: {}", userDetails.getId());
            addRefreshNeededAtResponseHeader(response);
            return;
        }
        
        // ...
    }
    
	// ...
	
}
```
<br/>

`dailyfeed-member` / `TokenService.java`
```java
// ...

@Slf4j
@RequiredArgsConstructor
@Transactional
@Service
public class TokenService {
	// ...

    /**
     * 토큰이 블랙리스트에 있는지 확인
     */
    public BlackListedPredicate isTokenBlacklisted(String jti) {
        try{
            // 1. Redis 에서 먼저 체크
            Boolean isKeyExists = stringRedisTemplate.hasKey(blacklistedJtiRedisKey(jti));
            if(Boolean.TRUE.equals(isKeyExists)){
                return BlackListedPredicate.BLACKLISTED;
            }

            // 2. Redis 에 없을 경우 DB 확인
            Optional<TokenBlacklist> blacklist = tokenBlacklistRepository.findByJti(jti);
            if (blacklist.isEmpty()) {
                return BlackListedPredicate.NOT_BLACKLISTED;
            }

            // 3. DB에 존재함 → 블랙리스트
            TokenBlacklist token = blacklist.get();
            Long ttl = calculateLocalDateTimeTTL(token.getExpiresAt());

            // 4. TTL이 남아있으면 Redis에 캐싱 (다음 조회 최적화)
            if (ttl > 0){
                stringRedisTemplate.opsForValue()
                        .set(
                                blacklistedJtiRedisKey(token.getJti()),
                                String.valueOf(token.getMemberId()),
                                Duration.ofSeconds(ttl)
                        );
                log.debug("Token cached to Redis with TTL: {} seconds", ttl);
            }
            else{
                log.debug("Token already expired, skipping Redis cache");
            }

            // 5. TTL과 관계없이 DB에 있으면 블랙리스트
            // (실제로는 Filter의 만료 체크에서 이미 차단되므로 여기까지 오지 않음)
            return BlackListedPredicate.BLACKLISTED;
        } catch (Exception e){
            return tokenBlacklistRepository.existsByJti(jti) ? BlackListedPredicate.BLACKLISTED : BlackListedPredicate.NOT_BLACKLISTED;
        }
    }
    
    // ...
    
}
```
<br/>

`dailyfeed-member`/ `JwtProcessor.java`
```java
// ...

public class JwtProcessor {

    // ...

    public static JwtExpiredPredicate checkIfExpired(Date expiration){
        if(expiration.before(new Date())) return JwtExpiredPredicate.EXPIRED;
        return JwtExpiredPredicate.NOT_EXPIRED;
    }

    public static String getJwtFromHeaderOrThrow(String authHeader) {
        if (authHeader == null || authHeader.isBlank() || !authHeader.startsWith("Bearer ")) {
            throw new BearerTokenMissingException();
        }

        return authHeader.replace("Bearer ", "");
    }
}
```
<br/>
