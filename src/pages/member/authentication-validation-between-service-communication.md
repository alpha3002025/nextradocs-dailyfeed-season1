# 서비스간 통신 시 인증 유효성 체크

> AI의 힘을 빌리지 않은 직접 작성한 글입니다.

<br/>


서비스간 통신 시 에는 JWT 를 주고받으면서 인증된 사용자인지 검증합니다. 이때 서버 비공개키가 Refresh 된 경우, AccessToken 이 만료된 경우, RefreshToken 이 만료된 경우  이렇게 세 가지 경우의 인증 관련 시나리오가 존재합니다.

서버 비공개 키가 Refresh 된 경우
- `401 UnAuthorized, {X-Token-Refress-Needed: true}` 응답 헤더를 전파해서 클라이언트에서 `POST /api/token/refresh` 를 하도록 유도합니다.
- 멤버 서버는 JWT 를 생성할 때 사용되는 비공개 키를 1시간에 한번씩 Refresh 합니다. 따라서 접속 후 최대 1시간이 도래하면, 어떤 클라이언트 든 `401 UnAuthorized, {X-Token-Refress-Needed: true}` 응답 헤더를 전달받게 됩니다.
- `POST /api/token/refresh` 를 수행하고 나면 새로운 AccessToken, RefreshToken 을 부여받게 됩니다.
- 클라이언트에서 `POST /api/token/refresh` 요청 시에, 서버는 해당 토큰이 로그인 or 새로고침 할 때 http only Cookie 로 심어둔 refreshToken 을 읽어서 유효한지 검사합니다. 
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Token-Refress-Needed: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.

AccessToken 이 만료되었을 경우
- `401 UnAuthorized, {X-Token-Refress-Needed: true}` 응답 헤더를 전파해서 클라이언트에서 POST /api/token/refresh 를 하도록 유도합니다.
- `POST /api/token/refresh` 를 수행하고 나면 새로운 AccessToken, RefreshToken 을 부여받게 됩니다.
- 클라이언트에서 `POST /api/token/refresh` 요청 시에, 서버는 해당 토큰이 로그인 or 새로고침 할 때 http only Cookie 로 심어둔 refreshToken 을 읽어서 유효한지 검사합니다. 
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Token-Refress-Needed: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.

RefreshToken 이 만료되었을 경우
- `401 UnAuthorized, {X-Relogin-Required: true}` 응답 헤더를 전파해서 login 을 새로 수행하도록 유도합니다.
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Relogin-Required: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.

<br/>



## ArgumentResolver - `AuthenticatedMemberProfileSummaryArgumentResolver`
content-svc, timeline-svc, image-svc, search-svc 에서는 클라이언트가 한 요청에 담긴 JWT 를 member-svc 에 `GET /api/members/summary` 요청으로 질의해서 인증된 사용자인지 검사합니다. 이때 `AuthenticatedMemberProfileSummaryArgumentResolver` 컴포넌트에서는 다음과 같이 `MemberFeignHelper`컴포넌트로 유효한 사용자인지 조회를 합니다.<br/>

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
  
		// (1)
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

(1) `return memberFeignHelper.getMyProfileSummary(jwt, response);`
- 요청한 사용자가 적합한 사용자인지 조회를 하기 위해 Feign 요청을 하는 부분입니다.

<br/>


## 응답 헤더 전파 로직 - `MemberFeignHelper`, `FeignResonseHandler`
Feign 모듈 설명문서에서도 작성할 내용이지만, Feign 요청시 발생한 응답 중 400,500 등의 코드에 대해서는 `FeignResponseHandler.java` 라는 컴포넌트 클래스에 별도로 정의해서 재사용 가능하도록 해두었습니다.

e.g. `MemberFeignHelper`
content-svc, timeline-svc, image-svc, search-svc 에서는 클라이언트가 한 요청에 담긴 JWT 를 member-svc 에 `GET /api/members/summary` 요청으로 질의해서 인증된 사용자인지 검사합니다.<br/>

```java
@Slf4j  
@RequiredArgsConstructor  
@Service  
public class MemberFeignHelper {  
    private final MemberFeignClient memberClient;  
    private final FeignResponseHandler feignResponseHandler;

    // ...

	public MemberProfileDto.Summary getMyProfileSummary(String token, HttpServletResponse httpResponse) {  
	    Response feignResponse = memberClient.getMyProfileSummary(token);
	    // (1)
	    feignResponseHandler.checkResponseHeadersAndStatusOrThrow(feignResponse, httpResponse);  
	  
	    try{  
	        String feignResponseBody = IOUtils.toString(feignResponse.body().asInputStream(), StandardCharsets.UTF_8);  
	        DailyfeedServerResponse<MemberProfileDto.Summary> apiResponse = feignObjectMapper.readValue(feignResponseBody, new TypeReference<DailyfeedServerResponse<MemberProfileDto.Summary>>() {});  
	        return apiResponse.getData();  
	    }  
	    catch (InvalidFormatException e){  
	        log.error("feign exception {} ", e.getMessage());  
	        e.printStackTrace();  
	        throw new MemberFeignSerializeFailException();  
	    }  
	    catch (Exception e){  
	        throw new MemberApiConnectionErrorException();  
	    }  
	    finally {  
	        if( feignResponse.body() != null ){  
	            try {  
	                feignResponse.body().close();  
	            }  
	            catch (Exception e){  
	                log.error("feign response close error", e);  
	            }  
	        }  
	    }  
	}
	
	// ...
	
}
```
<br/>

(1) `feignResponseHandler.checkResponseHeadersAndStatusOrThrow(feignResponse, httpResponse);`
- FeignResponseHandler 컴포넌트의 checkResponseHeadersAndStatusOrThrow 메서드를 통해 응답 헤더를 검증하고 유효하지 않은 요청에 대해 Exception 을 Throw 합니다.

<br/>

`FeignResponseHandler.java` 
```java
@Slf4j  
@Component  
public class FeignResponseHandler {
	// (2)
	public void propagateTokenRefreshHeader(Response feignResponse, HttpServletResponse httpResponse) {  
	    final String headerKey = MemberHeaderCode.X_TOKEN_REFRESH_NEEDED.getHeaderKey();  
	    Collection<String> headers = feignResponse.headers().get(headerKey);  
	  
	    if(headers != null && !headers.isEmpty()){  
	        String headerValue = headers.iterator().next();  
	        if(headerValue != null && !headerValue.isEmpty()){  
	            if ("true".equalsIgnoreCase(headerValue)){  
	                httpResponse.setHeader(headerKey, "true");  
	            }  
	        }  
	    }  
	}
	
	public void checkResponseHeadersAndStatusOrThrow(Response feignResponse, HttpServletResponse httpResponse){  
	    final int status = feignResponse.status();  
	    if (status >= 200 && status < 300) {  
	        return;  
	    }  
	  
	    if (status >= 400 && status < 500) {  
	        // HTTP 상태 코드에 따른 적절한 예외 처리  
	        if (status == 401) {  // (1)
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

(1) `checkResponseHeadersAndStatusOrThrow` : Response 상태 코드 검사 및 적절한 Exception 분류 및 Throw
- 서비스간 Feign 통신 시 401 Status 를 전달 받을 경우 (1) 의 처리를 하며 `propagateTokenRefreshHeader(...)` 메서드의 호출과 함께 `MemberUnauthorizedException` 을 throw 합니다.
- `propagateTokenRefreshHeader(...)` 은 (2) 에서 설명합니다.

(2) `propagateTokenRefreshHeader(...)` : feignResponse 중 401 에 관련된 헤더의 Key/Value 를 httpResponse 에 복사
- 401 응답을 받고 나서 (1) 을 거쳐서 도착한 `propagateTokenRefreshHeader(...)` 메서드 에서는 `feignResponse` 의 header 들중 `X-Token-Refresh-Needed` 에 해당하는 키/밸류에 대해 `httpResponse` 에 복사해줍니다.

<br/>

참고: `MemberHeaderCode` (dailyfeed-code 모듈)
```java
@Getter  
@RequiredArgsConstructor  
public enum MemberHeaderCode {  
    X_RELOGIN_REQUIRED("X-Relogin-Required"),  
    X_TOKEN_REFRESH_NEEDED("X-Token-Refresh-Needed");  
    private final String headerKey;  
}
```
<br/>
