# 예외를 던지는 함수는 `함수명OrThrow`가 되도록 정의

예외를 던지는 함수에는 가급적 `함수명OrThrow()`와 같은 형식의 네이밍 컨벤션을 적용했습니다. RuntimeException 과 같은 Unchecked Exception 의 경우 예외를 throw 하거나 `try ~ catch` 로 감싸는 것이 필수가 아니기에 어디서 예외가 발생할지 모른다는 것이 단점이 됩니다. 이런 이유로 예외를 던지는 함수에서는 `함수명OrThrow()`와 같은 형식의 네이밍 컨벤션을 적용했습니다.<br/>

>모든 코드에 적용하지는 못했고, 전체 프로젝트 코드의 80% 이상의 코드에 `함수명OrThrow()` 네이밍 컨벤션을 적용했습니다.<br/>

<br/>

e.g. `dailyfeed-feign` / `FeignResponseHandler.java`
```java
// ...

@Slf4j
@Component
public class FeignResponseHandler {
    
    // ...

    public void checkResponseHeadersAndStatusOrThrow(Response feignResponse, HttpServletResponse httpResponse){
        final int status = feignResponse.status();
        if (status >= 200 && status < 300) {
            return;
        }

        if (status >= 400 && status < 500) {
            // HTTP 상태 코드에 따른 적절한 예외 처리
            if (status == 401) {
                log.error("Unauthorized request to member service - invalid or expired token");
                propagateTokenRefreshHeader(feignResponse, httpResponse);
                throw new MemberUnauthorizedException();
            } else if (status == 403) {
                log.error("Forbidden request to member service - insufficient permissions");
                throw new MemberForbiddenException();
            } else if (status == 404) {
                log.error("Member not found in member service");
                throw new MemberNotFoundException();
            } else if (status >= 500) {
                log.error("Member service internal error - status: {}", status);
                throw new MemberApiConnectionErrorException();
            } else {
                log.error("Unexpected member service error - status: {}", status);
                throw new MemberApiConnectionErrorException();
            }
        }
    }
}
```
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
    
    @Transactional(readOnly = true)
    public Member getMemberOrThrow(AuthenticationDto.LoginRequest loginRequest) {
        return memberRepository
                .findFirstByEmailFetchJoin(loginRequest.getEmail())
                .orElseThrow(() -> new MemberNotFoundException());
    }

    public void checkIfPasswordMatchesOrThrow(String requestPassword, String encryptedPassword) {
        if (!passwordEncoder.matches(requestPassword, encryptedPassword)) {
            throw new MemberPasswordInvalidException();
        }
    }

    @Transactional(readOnly = true)
    public MemberExistsPredicate checkIfMemberAlreadyExists(AuthenticationDto.SignupRequest signupRequest) {
        if (memberRepository.findFirstByEmailFetchJoin(signupRequest.getEmail()).isPresent()) {
            return MemberExistsPredicate.EXISTS;
        }
        return MemberExistsPredicate.NOT_EXISTS;
    }
}
```