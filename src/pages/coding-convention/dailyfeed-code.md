# dailyfeed-code

`dailyfeed-code` 모듈은 다음과 같은 역할을 수행합니다.
- 주요 Exception,Enum,Dto,예외코드,요청/응답 객체 분류
- 서비스 간 통신을 위한 인터페이스

<br/>

**주요 Exception,Enum,Dto,예외코드,요청/응답 객체 분류**<br/>
`dailyfeed-code` 는 언뜻 보기에는 `common`, `core` 같은 모듈의 역할을 하는 것 처럼 보입니다. 하지만 `dailyfeed-code` 는 공통 모듈은 아닙니다. 제품레벨에서 정의한 Exception, Enum, Dto, 예외코드, 요청/응답객체 등의 객체들을 모아두는 역할을 합니다. `dailyfeed-code` 에는 특정 함수, 비즈니스 로직은 포함하고 있지 않습니다. 대신 주요 표현객체,예외코드, 요청/응답객체, Exception 분류 등을 모아두고 있습니다. <br/>
<br/>

**서비스 간 통신을 위한 인터페이스**<br/>
`dailyfeed-member-svc`, `dailyfeed-content-svc`, `dailyfeed-timeline-svc` 등과 같은 프로젝트 내에서는 `dailyfeed-code` 모듈을 서브 모듈로 import 해서 사용하고 있습니다. 시스템의 주요 코드, 예외객체, 요청/응답 객체들을 규칙에 맞도록 사용해야 하기 때문입니다. 그리고 각각의 서비스 간 통신을 할 때에도 요청/응답 객체가 공유됩니다. 즉, `dailyfeed-code` 모듈은 '서비스 간 통신을 위한 인터페이스'의 역할도 함께 수행하고 있습니다.<br/>
<br/>
