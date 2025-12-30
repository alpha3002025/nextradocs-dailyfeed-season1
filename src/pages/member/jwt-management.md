# JWT 관리

claude 의 힘을 빌리지 않은 지극히 주관적인 설명 문서입니다. 직접 쓰느라 머리아팠습니다. 😅<br/>
<br/>

## 목차
- AccessToken, RefreshToken
- 토큰 재발급, 재로그인 필요 케이스
- JTI (JWT ID)
- JWT Refresh 기능 (POST /api/token/refresh)
- JWT 형식

<br/>

## AccessToken, RefreshToken
JWT 는 accessToken, refreshToken 이라는 것으로 관리합니다.

AccessToken
- Access Token 은 사용자가 인증되었음을 의미하는 JWT 입니다. 짧은 만료기한(e.g. dailfyeed 는 2시간)을 가지며, Access Token 이 만료되었을 경우 `401 UnAuthorized` 를 응답하며, 응답 헤더로 `{‘X-Token-Refresh-Needed’: ‘true’}` 를 return 합니다.

RefreshToken
- Refresh Token 은 새로운 accessToken, refreshToken 을 부여받을때(`refresh`) 사용하는 토큰입니다. 
- accessToken 의 기한이 만료되거나, 서버 비공개키가 새로고침되었을때 서버에서 클라이언트로 `401 UnAuthorized {‘X-Token-Refresh-Needed’: ‘true’}` 를 응답 헤더로 전달합니다.
- 클라이언트가 서버로부터 응답 헤더로 `401 UnAuthorized {‘X-Token-Refresh-Needed’: ‘true’}` 를 받으면 클라이언트는 서버에 `POST /api/token/refresh` 요청을 합니다. 이때 서버는 httpOnly 쿠키에 저장된 `refreshToken` 을 읽어들여서 refreshToken 이 유효할 경우 새로운 accessToken, refreshToken 을 발급합니다. 만약 refreshToken 이 유효하지 않으면 `401 UnAuthorized, {X-Relogin-Required: true}` 응답 헤더를 전파해서 login 을 새로 수행하도록 유도합니다.

<br/>

## 토큰 재발급, 재로그인 필요 케이스
AccessToken, RefreshToken 을 재발급 받아야 하거나, 모두 무효화한 후 재로그인을 해야 하는 주요 케이스들은 다음과 같습니다.<br/>
<br/>

**서버 비공개 키가 Refresh 된 경우**
- `401 UnAuthorized, {X-Token-Refress-Needed: true}` 응답 헤더를 전파해서 클라이언트에서 POST /api/token/refresh 를 하도록 유도합니다.
- `POST /api/token/refresh` 를 수행하고 나면 새로운 AccessToken, RefreshToken 을 부여받게 됩니다.
- `POST /api/token/refresh` 는 frontend 에서 refreshToken 을 이용해서 요청하며, 서버에서도 refreshToken 을 읽어서 유효한지 검사합니다.
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Token-Refresh-Needed: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.
<br/>

**AccessToken 이 만료되었을 경우**
- `401 UnAuthorized, {X-Token-Refresh-Needed: true}` 응답 헤더를 전파해서 클라이언트에서 POST /api/token/refresh 를 하도록 유도합니다.
- `POST /api/token/refresh` 를 수행하고 나면 새로운 AccessToken, RefreshToken 을 부여받게 됩니다.
- `POST /api/token/refresh` 는 frontend 에서 refreshToken 을 이용해서 요청하며, 서버에서도 refreshToken 을 읽어서 유효한지 검사합니다.
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Token-Refresh-Needed: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.
<br/>

**RefreshToken 이 만료되었을 경우**
- `401 UnAuthorized, {X-Relogin-Required: true}` 응답 헤더를 전파해서 login 을 새로 수행하도록 유도합니다.
- Feign 관련 로직 내에 `401 UnAuthorized, {X-Relogin-Required: true}`를 만났을 때에 대한 처리 로직이 있으며 `dailyfeed-feign` 모듈에 해당 기능들이 존재합니다.
- e.g. 로그인 한 시점으로부터 30일 이상 접속하지 않은 경우

<br/>

## JTI (JWT ID)
JTI 는 JWT 의 ID를 의미합니다.<br/>

이렇게 JWT 에 id를 부여한 JTI 를 부여한 이유는, refreshToken 으로 토큰 새로 고침 요청을 수행할 때 해당 refreshToken 이 어떤 JWT(JTI 로 식별)에 대한 refreshToken 인지 알수 있어야 하기 때문입니다. 참고로 JWT 와 JTI 는 Database 에 따로 저장해서 관리하지 않습니다. RefreshToken 은 `jwt_refresh_tokens` 테이블에 저장하고 있으며 JTI를 의미하는 컬럼은 `acess_token_id` 컬럼입니다. <br/>

요약해보면 다음과 같습니다.
- JTI (JWT ID) = JWT의 ID
- accessToken = JWT
- refreshToken = JWT 에 대한 refresh 요청을 할때 사용하는 토큰
- refreshToken 내에는 accessToken 의 id 인 `JTI` 를 보유

<br/>

JTI 의 채번 방식은 `UUID` 방식을 사용하고 있습니다. 데이터베이스의 시퀀스 기능을 사용하면 편리했겠지만, 토큰의 경우 'DB 계층의 기능에 종속되지 말아야겠다'고 생각해서 UUID 기반의 고유키를 가지도록 정했습니다. JTI 를 만들기 위해 Database 를 남용하기 보다는 UUID 로 생성하는 것이 더 낫다고 판단해서 이렇게 결정했습니다.<br/>
<br/>


## JWT Refresh 기능 (`POST /api/token/refresh`)
기존 accessToken, refreshToken 을 무효화 하고 새로운 accessToken, refreshToken 을 만드는 기능입니다.<br/>

 다음의 경우에 대해 frontend 는 자기 자신이 가지고 있는 refreshToken 을 통해 서버에 `POST /api/token/refresh` 요청을 통해 새로운 accessToken, refreshToken 을 부여받게 됩니다.
 - accessToken 기한 만료
 - 서버 비공개키 Refresh 된 경우
<br/>

> 참고
> - refreshToken 은 cookie 내의 "refresh_token" 에 해당하는 UUID 값입니다.
> - refreshToken 이 만료된 경우에는 서버에서는 재로그인을 수행하도록 `401 UnAuthorized, {X-Relogin-Required: true}` 을 헤더로 전파합니다.

<br/>

서버측에서 refreshToken 을 새로 생성하는 절차를 요약해보면 다음과 같습니다.
- refreshToken 값에 해당하는 Refresh 토큰 정보를 `jwt_refresh_tokens` 테이블에서 Read
- 만약 이미 무효화된 refresh token 일 경우 401 응답
- 기존 refreshToken 에 대해 `jwt_refresh_tokens` 테이블 내의 해당 row 무효화처리, Redis 에도 무효화 마킹
- 새로운 accessToken, refreshToken 생성 후 반환

<br/>

## 서버 비공개 키 Refresh
JWT 를 만들때 사용하는 서버의 비공개 키는 영구적으로 하나의 키를 계속 보유하는 것 보다는 주기적으로 변경되는 것이 보안상 유리합니다. 이런 이유로 서버 비공개 키를 1시간에 한번씩 Refresh 를 수행합니다.

![](./img/jwt-management/20251230-16-12-21-1.png)


서버 비공개 키를 Refresh 하는 작업은 Batch Job 으로 정의했으며, `dailyfeed-batch-svc` 프로젝트 내에 `jwtKeyRotationJob` 이라는 Job 으로 정의되어 있습니다. `jwtKeyRotationjob`은  kubernetes 의 cronjob (`dailyfeed-batch-{cronjobId}`} 에 의해 기동됩니다. cronjob 은 1시간에 한번씩 실행되며 cronjob 의 설정은  `dailyfeed-installer/dailyfeed-app-helm/batch` 내에서 확인가능합니다. 

dailyfeed-batch-svc (spring batch job)
- 서버 비공개 키 Refresh Batch Job : `jwtKeyRotationJob`
- project : https://github.com/alpha3002025/dailyfeed-batch/svc
- kubernetes 의 cronjob 에 의해 기동됩니다.

dailyfeed-app-helm (cronjob)
- kubernetes 의 cronjob 내에서 `dailyfeed-batch` 이미지 수행시 `jwtKeyRotationJob` 을 수행합니다.
- project
	- dailyfeed-app-helm: https://github.com/alpha3002025/dailyfeed-app-helm
	- dailyfeed-installer: https://github.com/alpha3002025/dailyfeed-installer
- dailyfeed-installer/dailyfeed-app-helm/batch 또는 dailyfeed-app-helm/batch 를 확인해보시면, kubernetes cronjob 에 대한 내용이 helm 으로 정의되어있는 것을 확인할 수 있습니다.

<br/>


서버 비공개 키가 Refresh 되었을때 frontend → content-svc, timeline-svc, image-svc 등으로 Request 가 오는 경우, 다음과 같이 동작합니다.<br/>
- `content-svc,timeline-svc,image-svc, ...`
	- 오래된 키로 만든 JWT 로 인증유효성 체크를 위해 member-svc를 feign 을 통해 `GET /api/members/profile` 조회를 수행
	- 참고: `MemberFeignHelper` 를 통해 수행
- member-svc 
	- 서버 비공개 키가 active 상태인지 체크
	- active 상태가 아닐 경우 `401 UnAuthorized, {X-Token-Refress-Needed: true}`을 응답 헤더로 하는 응답을 return 
- `content-svc,timeline-svc,image-svc, ...`
	- `401 UnAuthorized, {X-Token-Refress-Needed: true}` 응답 헤더가 있을 경우 Exception 과 함께 그대로 응답 헤더 전파
	- Exception 은 ControllerAdvice 를 통해 예외 처리
- frontend
	- `POST /api/token/refresh` 를 통해 token refresh 진행
	- 정상적으로 새로운 accessToken, refreshToken 을 발급받았다면 원래 하려고 했던 요청을 재개

<br/>


![](./img/jwt-management/20251230-16-12-19-1.png)


<br/>

## JWT 형식
JWT 형식은 다음과 같습니다.
- `{Header}.{Payload}.{Signature}`

e.g. 
- `eyJraWQiOiJrZXktMjAyNTExMTktcHJpbWFyeSIsImFsZyI6IkhTMjU2In0.eyJqdGkiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJzdWIiOiIxMjM0NSIsImV4cCI6MTczMjA2MDgwMCwiaWQiOjEyMzQ1fQ.7XJ8K9mP4nR2tQ5vW6xY8zA1bC3dE4fG5hI6jK7lM8n`

<br/>

현재 dailyfeed-member-svc 에서는 header, payload, signature 에 JWT 의 형식에 맞춰 다음의 항목들을 저장합니다.<br/>
<br/>

header
- `kid` : 서버 비공개키의 id
- `alg` : HS256 을 선택

payload
- `id` : jti
- `subject` : memberId
- `expiration` : 만료일

signature
- Header + Payload를 Secret Key로 서명한 해시 값

<br/>


다음은 이러한 내용에 따라 JWT 변환을 수행하는 코드입니다.
```java
// TokenService.java
public TokenPair generateTokenPair(JwtDto.UserDetails userDetails, String deviceInfo, String ipAddress) {
	// ...
	// (1)
	String jti = generateJti();
	// ...
	
	// (2)
	// 액세스 토큰 생성 (JTI 포함, 만료 시간은 JwtKeyHelper에서 생성)  
	String accessToken = jwtKeyHelper.generateTokenWithJti(userDetails, jti);
	// ...
}

// (3)
// JwtKeyHelper.java
public String generateTokenWithJti(JwtDto.UserDetails userDetails, String jti) {  
    Key primaryKey = jwtKeyRotationService.getPrimaryKey();  
    String primaryKeyId = jwtKeyRotationService.getPrimaryKeyId();  
    Date expirationDate = generateAccessTokenExpiration();  
  
    return Jwts.builder()  
            .setHeaderParam("kid", primaryKeyId)  
            .setId(jti)  // JTI 설정  
            .setSubject(String.valueOf(userDetails.getId()))  
            .setExpiration(expirationDate)  
            .claim("id", userDetails.getId())  
            .signWith(primaryKey, SignatureAlgorithm.HS256)  
            .compact();  
}
```

(1) `String jti = generateJti();`
- UUID 형식의 문자열을 생성하는데 이 것은 JTI로 사용됩니다.

(2) `String accessToken = jwtKeyHelper.generateTokenWithJti(userDetails, jti);`
- jti 와 userDetails 를 활용해서 accessToken 문자열을 생성합니다.

(3) generateTokenWithJti 함수
- `Key primaryKey = jwtKeyRotationService.getPrimaryKey();` : 서버에 현재 활성화된 비공개 키를 가져옵니다.
- `String primaryKeyId = jwtKeyRotationService.getPrimaryKeyId();` : 비공개 키의 id 를 얻어옵니다.
- `return Jwts.builder() ... compact();` : kid, jti, memberId, expirationDate, alg, signature 등을 지정합니다. 비공개키인 primaryKey 로 서명하고 있습니다.

