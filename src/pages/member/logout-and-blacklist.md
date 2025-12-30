# Logout 과 Blacklist 기능

>  AI의 힘을 빌리지 않은 직접 작성한 글입니다.


사용자가 로그아웃을 요청하면, 서버는 다음의 작업을 수행합니다.
- JWT 분해 후 JTI 획득
- 해당 JTI 를 Blacklist 에 등록
- 해당 JTI 에 대한 RefreshToken 을 철회(`is_revoked=true`)처리

<br/>

## logout 
logout 절차를 간략화해서 그림으로 표현해보면 다음과 같습니다.<br/>

![](./img/logout-and-blacklist/20251230-16-12-11-1.png)

<br/>


위의 절차를 조금 더 코드레벨로  요약해보면 다음과 같이 진행됩니다.<br/>

(1) JTI 정보 추출 
- 요청한 JWT 의 JTI 획득

(2) blacklist 캐싱 
- JTI 를 Redis 의 blacklist 네임스페이스에 set 자료구조로 캐싱

(3) blacklist 등록
- JTI 를 `jwt_blacklist` 테이블에 insert
- JTI, memberId, expiresAt, reason 등을 명시해서 `jwt_blacklist` 테이블에 해당 데이터 insert

(4) refresh token 철회 
- JTI 에 해당하는 refresh token 의 `is_revoked` 를 true 로 세팅
- `jwt_refresh_tokens` 테이블 내에 JTI 에 해당하는 토큰의 `is_revoked` 를 true 로 세팅

<br/>

### (1) JTI 정보 추출 : 요청한 JWT 의 JTI 획득
사용자가 로그아웃을 요청할때는 다음 형식의 API 요청을 수행합니다.
```http
POST /api/authentication/logout
Authentication: Bearer {accessToken}
```

#### 참고) accessToken 의 형식
`accessToken` 은 사용자가 로그인시 부여받은 JWT 입니다. 이 JWT 는 다음과 같은 형식으로 만들어집니다.
```java
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
header 에 `kid` 를 설정하고 있고, token 의 id 를 `jti` 로 지정하고 있습니다. jti 는 UUID 형식의 string 입니다.

만들어지는 jwt 는 결론적으로는 결국 string 인데 다음과 같은 형태입니다.
- {Header}.{Payload}.{Signature}
- e.g. `eyJraWQiOiJrZXktMjAyNTExMTktcHJpbWFyeSIsImFsZyI6IkhTMjU2In0.eyJqdGkiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJzdWIiOiIxMjM0NSIsImV4cCI6MTczMjA2MDgwMCwiaWQiOjEyMzQ1fQ.7XJ8K9mP4nR2tQ5vW6xY8zA1bC3dE4fG5hI6jK7lM8n`

이때 kid 는 위의 코드 처럼 `{Header}` 항목에 지정했습니다. jti 는 {Payload} 에 저장됩니다. 따라서 `{Payload}` 의 경우 비공개 키로 분해해줘야 프로그램에서 읽을 수 있습니다.

#### JTI 추출
JTI 를 읽어들이기 위해서는 다음과 같은 작업을 수행합니다.
```java
// TokenService.java
public void logout(String accessToken, Long memberId) {  
    try {  
	    // (1) keyId 를 jwt 를 읽어들여서 추출합니다.
        String keyId = JwtProcessor.extractKeyIdOrThrow(accessToken);
        
        // (2) 액세스 토큰에서 정보 추출  
        Claims claims = jwtKeyHelper.readClaim(keyId, accessToken); // (2.1)
        String jti = jwtKeyHelper.extractJti(claims); // (2.2)
        
        // ...
	} catch (Exception e) { ... }

// (3)
// JwtKeyHelper.java
public Claims readClaim(String keyId, String token) {  
    Key key = jwtKeyRotationService.getKeyByKeyId(keyId);  
  
    Claims claims = Jwts.parserBuilder()  
            .setSigningKey(key)  
            .build()  
            .parseClaimsJws(token)  
            .getBody();  
  
    return claims;  
}
```

(1) keyid 추출
- 위에서 설명했듯 header 에 포함됩니다. 
- header 는 단순히 header 문자열을 base64 decode 하면 `{"kid":"key-20251119-primary","alg":"HS256"}` 와 같은 문자열을 얻을수 있기에 쉽게 추출해낼 수 있습니다.

(2) 액세스 토큰에서 정보 추출
- (2.1) : jwtKeyHelper 의 readClaim(keyId, accessToken) 메서드는 dailyfeed-member 에서 정의한 jwt 분해 함수이며, 현재 `kid` 에 해당하는 해당 시점의 서버 비공개키를 읽어들여서 JWT 를 Claim 으로 변환해주는 역할을 합니다.
- (2.2) : claim 객체의 id 를 읽어들이면 그것이 jti 입니다.

결과적으로는 (2) 의 로직을 통해 jti 를 획득했습니다. 다음 (2),(3),(4) 에서는 로그아웃을 위한 부가적인 처리를 수행하게 됩니다.<br/>


### (2) blacklist 캐싱 : JTI 를 Redis 의 blacklist 네임스페이스에 set 자료구조로 캐싱
로그아웃 요청된 JTI 는 Redis 에 캐싱 처리를 합니다. 현재 로그아웃 하려는 사용자 외에도 다른 사용자들이 요청을 수행할 때마다 Blacklist에 등록된 사용자인지(로그아웃한 사용자인지)를 조회하는 절차를 거치게 되는데, 매번 Database 에 조회를 수행하게 되면 성능에 영향을 줄수도 있기 때문에, Redis 를 이용해 캐싱을 합니다.<br/>

현재 dailyfeed-member-svc 프로젝트에서는 Redis 내의 `member:authentication:blacklist` 에 set 자료구조로 jti 를 저장합니다.<br/>
<br/>


### (3) blacklist 등록 : JTI 를 `jwt_blacklist` 테이블에 insert
(2) 에서 Redis 의 Blacklist 를 관리하는 네임스페이스인 `member:authentication:blacklist` 에 set 자료구조로 저장했습니다. 이번에는 MySQL의 `jwt_blacklist` 테이블 에도 JTI 를 저장합니다. 이때 jti 외에도 `memberId`, `expiresAt`, `reason`등을 컬럼으로 하는 row 를 `jwt_blacklist` 에 insert 하게 됩니다.<br/>
<br/>

### (4) refresh token 철회 : JTI 에 해당하는 refresh token 의 `is_revoked` 를 true 로 세팅
(3) 에서 로그아웃하려는 사용자를 blacklist 에 등록했습니다. (`jwt_blacklist`)<br/>
그런데 Refresh Token 목록에도 해당 데이터를 반영해야 부적절한 접근에 대한 방지를 할수 있습니다. 이런 이유로 `jwt_refresh_tokens` 테이블 내에 로그아웃 요청한 `jti` 에 해당하는 토큰의 `is_revoked` 역시 `true`로 세팅해둡니다.<br/>

Refresh Token 은 이전 문서에서 살펴봤듯, 토큰이 만료기한이 도래했을때 또는 서버 비공개 키가 새로고침 되어 클라이언트가 가지고 있는 키가 만료되었을 때 서버측에서는  `401 UnAuthorized, {X-Token-Refress-Needed: true}` 을 응답헤더로 return 하며 클라이언트 측에서는 이 응답을 받으면 `POST /api/token/refresh` 를 요청해서 키를 새로고침합니다.<br/>

이렇게 키를 새로고침하는 용도의 RefreshToken 에 대해 로그아웃한 사용자에 대해서 철회를 해줘야 하기 때문에 Refresh token 을 철회하는 절차를 거치게 됩니다.<br/>
<br/>


## Blacklist
로그아웃 등을 통해 토큰을 더 이상 사용하면 안되는 토큰들에 대해 Blacklist 에 등록하기 위해 사용하는 개념입니다. `dailyfeed-member-svc` 가 다음과 같이 1기만 존재할 경우에는 Blacklist 를 굳이 해야할 필요성을 느끼지 못할수 있으며, 단순하게 Spring 의 SecurityContextHolder 만을 이용해서 처리하게 될 것입니다.
![](./img/logout-and-blacklist/20251230-16-12-11-2.png)


<br/>

하지만 다음과 같이 여러 기의 `dailyfeed-member` 를 운영중인 경우 로그아웃 요청이 1번 member 서버에만 도달했고, 2번,3번... 등의 서버에는 도달하지 않았을때 2번,3번에서 해당 사용자가 로그아웃 했는지 판별할 방법이 없습니다. 따라서 하나의 서버에서 로그아웃을 처리한 후에는 로그아웃 처리가 완료된 jti 에 대해서는 blacklist 에 등록해서 다른 서버들에서도 일관된 처리를 할 수 있도록 하기 위해 Blacklist 개념을 사용했습니다.
![](./img/logout-and-blacklist/20251230-16-12-30-1.png)
<br/>

