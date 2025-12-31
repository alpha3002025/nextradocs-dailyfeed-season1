# FeignHelper, FeignClient, FeignResponseHandler

각 개별 서비스에 대한 FeignClient 는 FeignClient 빈을 그대로 raw 하게 사용하기보다는 `*FeignHelper` 컴포넌트를 통해 해당 Feign 의 처리와 후처리, 응답 객체 변환작업을 수행하도록 Wrapping 하도록 구조를 잡았습니다. 즉, `*FeignHelper` 컴포넌트는 FeignClient 의 기능을 Wrapping 하는 Wrapper 클래스의 역할을 수행합니다.<br/>

다음은 `MemberFeignClient` 에 대한 `MemberFeignHelper` 의 접근방식에 대한 그림입니다.<br/>

**e.g. `MemberFeignHelper`, `MemberFeignClient`, `FeignResponseHandler`**<br/>
![](./img/feign-helper-feign-client-feign-response-handler/20251231-16-12-01-1.png)
<br/>

`MemberFeignClient.java`
- interface 이며, `*FeignClientConfig.java` 에서 Resilience4j 의 Feign 라이브러리를 통해 `*FeignClient` 타입의 구체 컴포넌트로 변환하게 됩니다. 
<br/>

`MemberFeignHelper.java`
- `*FeignClient` 타입의 Bean 을 주입받아서 통신을 수행합니다.
- 통신 수행시 응답받은 데이터를 실제 객체로 역직렬화 하는 작업, 응답 코드에 따른 후처리를 수행합니다.
- 응답 코드에 따른 후처리의 경우 `FeignResponseHanlder.java` 라는 클래스에 별도로 정의해두었고, `FeignResponseHanlder` 역시 스프링이 관리하는 컴포넌트입니다.
<br/>

`FeignResponseHandler.java`
- 주요 응답 코드에 따라 필요한 처리, 헤더 전파 등을 수행합니다.
<br/>

