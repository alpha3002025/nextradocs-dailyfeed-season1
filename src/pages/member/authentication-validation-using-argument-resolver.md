# ArgumentResolver 기반 인증 유효성 체크

> AI의 힘을 빌리지 않은 직접 작성한 글입니다.

<br/>


## AOP(x) → ArgumentResolver(o) 
요청 헤더의 JWT 인증 체크를 수행하는 로직은 모두 ArgumentResolver 를 사용했습니다. 인증 체크의 경우 흔히 AOP 를 이용해 JWT 를 분해하고 검사하거나 유효한 사용자인지를 조회하는 것이 보편적인 선택이 될수도 있을 것 같습니다. 하지만 dailyfeed-member-svc 의 경우 **ArgumentResolver를 이용한 인증방식**을 선택했습니다.<br/>

AOP 대신 ArgumentResolver 를 선택한 이유를 정리해보면 다음과 같습니다.<br/>
<br/>

AOP 를 사용하지 않은 이유
- AOP 의 경우 Controller 외부에서도 사용될 수 있다는 점을 감안해야 했고, 오용될수 있는 여지가 있다고 판단했습니다. 
- 지나친 AOP 의존은 공통로직의 비대화 + 결합도 증가 를 불러온다고 판단했습니다.
<br/>

ArgumentResolver 를 사용한 이유
- Web 을 통해 전달받은 파라미터를 통해 검증한다는 목적에 정확하게 부합해서 ArgumentResolver 를 선택했습니다.
- Web 요청 외에는 사용되지 않기에 오용될 소지가 적다는 점 역시 선택에 한몫 했습니다.

<br/>


## 주요 ArgumentResolver
### `AuthenticatedMemberProfileSummaryArgumentResolver`
`AuthenticatedMemberProfileSummaryArgumentResolver`는 `@AuthenticatedMemberProfileSummary` 어노테이션이 붙은 웹 파라미터에 대해 동작하는 ArgumentResolver 입니다. `AuthenticatedMemberProfileSummaryArgumentResolver` 에서는 frontend 의 요청을 수행 전 합당한 사용자인지 검사를 위해 MemberFeignHelper 를 통해 GET /api/members/profile 을 수행합니다. 주로 content-svc, timeline-svc, search-svc, image-svc, activity-svc 등의 서비스에서 member-svc 로 인증을 체크하기 위해 사용합니다.<br/>
<br/>

- 토큰 refresh 필요시 (토큰 만료): `401 UnAuthorized, {X-Token-Refresh-Needed: true}`응답헤더를 받을 경우 `POST /api/token/refresh` 를 유도 
- 로그인 기간 만료 시 : `401 UnAuthorized, {X-Relogin-Required: true}` 응답헤더를 받을 경우 재로그인 유도

<br/>

e.g.
```java
@Component  
@RequiredArgsConstructor  
public class AuthenticatedMemberProfileSummaryArgumentResolver implements HandlerMethodArgumentResolver {  
    private final MemberFeignHelper memberFeignHelper;  
  
    @Override  
    public boolean supportsParameter(MethodParameter parameter) {  
        return parameter.hasParameterAnnotation(AuthenticatedMemberProfileSummary.class) &&  
                parameter.getParameterType().equals(MemberProfileDto.Summary.class);  
    }  
  
    @Override  
    public Object resolveArgument(MethodParameter parameter,  
                                  ModelAndViewContainer mavContainer,  
                                  NativeWebRequest webRequest,  
                                  WebDataBinderFactory binderFactory) throws Exception {  
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);  
        HttpServletResponse response = webRequest.getNativeResponse(HttpServletResponse.class);  
  
        String authHeader = request.getHeader("Authorization");  
        String jwt = extractToken(authHeader);  
  
        // JWT 검증 및 멤버 추출 (예외 발생 가능)  
        return memberFeignHelper.getMyProfileSummary(jwt, response);  
    }  
  
    public String extractToken(String authHeader) {  
        if (authHeader == null || authHeader.isBlank() || !authHeader.startsWith("Bearer ")) {  
            throw new BearerTokenMissingException();  
        }  
  
        return authHeader.replace("Bearer ", "");  
    }  
}
```
<br/>



### `AuthenticatedMemberInternalArgumentResolver`
`AuthenticatedMemberInternalArgumentResolver`는 `@InternalAuthenticatedMember` 어노테이션이 붙은 웹 파라미터에 대해 동작하는 ArgumentResolver 입니다. `AuthenticatedMemberInternalArgumentResolver` 에서는 주요 백엔드 서비스들이 높은 빈도로 요청하는 `GET /api/members/profile` 외에도 팔로우요청, 멤버 핸들 조회 등 다양한 멤버 관련 연산에 대해 member-svc 내부에서 인증된 사용자인지 검사를 수행하는 역할을 합니다. 주로 member-svc 내부에서 외부로부터 전달받은 요청에 대한 사용자가 적합한지 체크하기 위해 사용됩니다.

- member-svc 서비스에서 frontend 및 다른 백엔드 서비스(content-svc,timeline-svc,search-svc,image-svc,activity-svc)로부터의 합당한 사용자인지를 묻는 경우에 대한 처리를 수행합니다.
- `GET /api/members/profile` 의 경우 높은 빈도로 요청되는 API 이기에 Redis Caching 처리 되어 있습니다.
- `@InternalAuthenticatedMember` 어노테이션이 붙은 웹 파라미터에 대해 동작하는 ArgumentResolver 입니다.

<br/>

e.g.
```java
@Component  
@RequiredArgsConstructor  
public class AuthenticatedMemberInternalArgumentResolver implements HandlerMethodArgumentResolver {  
    private final JwtKeyHelper jwtKeyHelper;  
    private final MemberRedisService memberRedisService;  
  
    @Override  
    public boolean supportsParameter(MethodParameter parameter) {  
        return parameter.hasParameterAnnotation(InternalAuthenticatedMember.class) &&  
                parameter.getParameterType().equals(MemberDto.Member.class);  
    }  
  
    @Override  
    public Object resolveArgument(MethodParameter parameter,  
                                  ModelAndViewContainer mavContainer,  
                                  NativeWebRequest webRequest,  
                                  WebDataBinderFactory binderFactory) throws Exception {  
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);  
        HttpServletResponse response = webRequest.getNativeResponse(HttpServletResponse.class);  
  
        /// jwt 추출  
        String authHeader = request.getHeader("Authorization");  
        String jwt = extractToken(authHeader);  
  
        /// key Id 추출  
        String keyId = JwtProcessor.extractKeyIdOrThrow(jwt);  
  
        /// jwt body 추출  
        JwtDto.UserDetails userDetails = jwtKeyHelper.readUserDetailsFromToken(keyId, jwt);  
  
        /// Key Refresh 필요한지 체크  
        jwtKeyHelper.checkAndRefreshHeader(jwt, response);  
  
        MemberDto.Member memberOrThrow = memberRedisService.getMemberOrThrow(userDetails.getId());  
        return memberOrThrow;  
    }  
  
    public String extractToken(String authHeader) {  
        if (authHeader == null || authHeader.isBlank() || !authHeader.startsWith("Bearer ")) {  
            throw new BearerTokenMissingException();  
        }  
  
        return authHeader.replace("Bearer ", "");  
    }  
}
```
<br/>

