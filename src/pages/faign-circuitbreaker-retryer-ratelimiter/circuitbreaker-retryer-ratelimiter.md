# CircuitBreaker, Retryer, Rate Limiter

현재 프로젝트에서는 resilience4j 의 CircuitBreaker, Retryer, RateLimiter 를 사용하고 있습니다.<br/>
<br/>

## CircuitBreaker
현재 서비스에서 다른 마이크로서비스로 feign 으로 요청을 수행시 장애가 났을 경우 얼마나 자주 발생했는지 등에 대한 기준을 통해 장애가 났다고 판정될 경우 해당 서비스로의 호출을 차단하고, 자동 복구되는 조건값을 통해 장애 회복시의 복구를 자동화할 수 있도록 하는 설정을 제어하는 기능들을 제공해주는 라이브러리입니다. <br/>

CircuitBreaker 를 적용하면, 장애가 발생했을 때 장애가 복구될때까지 사람이 직접 모니터 앞에서 기다렸다가 정상화 시킬 필요 없습니다. 급작스러운 장애 발생시에 CircuitBreaker 에 의해 빠르게 해당 장애에 대해 몇분 안에 자동으로 호출을 차단하는 방식으로 대응이 자동화되며, 장애 복구 역시 해당 장애를 일으킨 서비스가 복구될 때까지 기다렸다가 복구되는 것 역시 자동화 할 수 있습니다. 물론 장애차단/복구 시에 인간이 개입해서 어느 정도의 보완작업이 필요할 수 있기는 하지만, 급작스러운 장애 등에 대해 빠른 시간 내에 대응하는 것이 자동화 된다는 것은 장점입니다.<br/>
<br/>

![](./img/circuitbreaker-retryer-ratelimiter/20251231-16-12-09-1.png)

<br/>

Circuit Breaker 는 3가지의 상태를 가집니다.
- `CLOSED` (닫힘) : 정상
- `OPEN` (열림) : 차단
- `HALF_OPEN` (반열림) : 테스트 단계

<br/>

현재 프로젝트에서는 설정의 수준에 따라 `default`, `fast`, `conservative` 로 분류해두었고, 각 서비스 별로 다음과 같이 지정했습니다. 
- critical : timeline-svc, member-svc
- default : content-svc, activity-svc
- bulk : image-svc

<br/>

예를 들어, default 설정의 경우 다음과 같이 지정했습니다.<br/>

`max-attempts: 3`
- 최대 3번까지 시도 (최초 1번 + 재시도 2번), 실패 시 총 3번의 호출 시도 후 최종 실패 처리

`wait-duration: 500ms`
- 각 재시도 사이의 대기 시간 (실패 후 재시도 하지않고 500ms 를 기다린 후 재시도)
- 장점
	- Backoff : 대상 서비스에 즉시 재시도하지 않고 일정시간 대기하는 것을 Backoff 라고 합니다.
	- 일시적 장애 회복 시간 제공 : retry 하기 전에 term 을 두어서 회복시간 부여

<br/>

`retry-exception:`
- 어떤 exception 발생시 재시도 할지

`ignore-exceptions:`
- 어떤 exception 발생시 재시도를 하지 않을지

`sliding-window-type: COUNT_BASED`
- 슬라이딩 윈도우 타입 (COUNT_BASED(호출횟수 기반), TIME_BASED(시간 기반))

`sliding-window-size: 100`
- 슬라이딩 윈도우 크기. 최근 N개의 호출을 기준으로 실패율을 계산

`minimum-number-of-calls: 10`
- 최소 호출 횟수. 이 횟수 이상 호출되어야 circuit breaker 가 실패율을 계산

`failure-rate-threshold: 50`
- 실패율 임계값(%) : 이 비율 이상 실패시 Circuit OPEN

`slow-call-rate-threshold: 80`
- 느린 호출 기준 시간. 이 시간 이상 걸릴 경우 느린 호출로 간주

`wait-duration-in-open-state: 60s`
- OPEN 상태 대기 시간. Circuit 이 OPEN 된 후 HALF_OPEN 으로 전환되기까지의 대기 시간

`permitted-number-of-calls-in-half-open-state: 10`
- HALF_OPEN 상태에서 허용할 호출 수. 이 횟수 만큼 테스트 호출 후 CLOSED/OPEN 결정

`automatic-transition-from-open-to-half-open-enable: true`
- 자동 전환 활성화 : OPEN → HALF_OPEN 자동 전환 여부

<br/>
<br/>

## Retryer
Retryer 는 현재 서비스가 다른 마이크로 서비스로 feign 을 통해 요청호출 시에 재시도 방식에 대한 설정을 정의하는 기능입니다. 만약 다른 마이크로 서비스로 feign 을 통해 요청을 호출 시에 에러 발생시 재시도 횟수, 재시도 전 timeout 정도, 어떤 Exception 에 대해 재시도할지 등에 대한 재시도에 대한 다양한 설정을 제공합니다.<br/>
<br/>

Retryer 를 사용하면 재시도 시에 다음과 같은 장점을 가지게 됩니다.
- 불필요한 재시도 방지 (e.g. 4xx 등에 대해서는 즉시 실패 처리)
- 의미있는 재시도 (e.g. 네트워크 장애, 타임아웃의 경우 재시도하도록 설정)
- Backoff 전략으로 부하 분산
<br/>

> (참고) 백오프 : 시스템이 실패 후 재시도할 때 즉시 재시도하지 않고 일정시간 대기하는 전략을 의미합니다.

<br/>

현재 프로젝트에서는 설정의 수준에 따라 `default`, `fast`, `conservative` 로 분류해두었고, 각 서비스 별로 다음과 같이 지정했습니다. 
- critical : timeline-svc, member-svc
- default : content-svc, activity-svc
- bulk : image-svc

<br/>

예를 들어, default 설정의 경우 다음과 같이 지정했습니다.<br/>

`max-attempts: 3`
- 최대 3번까지 시도 (최초 1번 + 재시도 2번), 실패 시 총 3번의 호출 시도 후 최종 실패 처리

`wait-duration: 500ms`
- 각 재시도 사이의 대기 시간 (실패 후 재시도 하지않고 500ms 를 기다린 후 재시도)
- 장점
	- 일시적 장애 회복 시간 제공 : retry 하기 전에 term 을 두어서 회복시간 부여

`retry-exception:` 
- 어떤 exception 발생시 재시도 할지

`ignore-exceptions:`
- 어떤 exception 발생시 재시도를 하지 않을지

<br/>

참고로, Backoff 에는 다음의 종류들이 있습니다.
- Fixed Backoff (고정 백오프) : 매번 동일한 시간 대기 (e.g. 500ms → 500ms → 500ms)
- Exponential Backoff (지수 백오프) : 재시도마다 대기 시간이 지수적으로 증가 (e.g. 100ms → 200ms → 400ms → 800ms)
- Linear Backoff (선형 백오프) : 재시도마다 대기 시간이 선형적으로 증가 (e.g. 100ms → 200ms → 300ms → 400ms)

<br/>
<br/>

## Rate Limiter
`Rate Limiter` 는 현재 서비스가 다른 마이크로서비스로 feign 을 통해 요청을 하는 outbound 요청의 빈도(rate)를 제한하는 기능입니다.<br/>

장점
- self-protection : 다른 서비스에 과부하를 주지 않도록 보호해줄수 있습니다.
- 연쇄 장애 방지 : 현재 서비스에서의 과도한 요청으로 인해 전체 시스템에 영향을 주지 않도록 합니다.
- 호출 주기 안정화 : 특정 서비스로의 급격한 트래픽 증가시 제한을 걸수 있습니다.
- 일정한 양의 최소/최대 호출 가능 rate 를 지정하면, 현재 시스템 내에서 해당되는 대상 서비스 역시 어느 정도의 트래픽을 허용치로 둘지 명확해집니다.

<br/>

현재 프로젝트에서는 설정의 수준에 따라 `default`, `fast`, `conservative` 로 분류해두었고, 각 서비스 별로 다음과 같이 지정했습니다. 
- critical : timeline-svc, member-svc
- default : content-svc, activity-svc
- bulk : image-svc

<br/>

예를 들어, default 설정의 경우 다음과 같이 지정했습니다.<br/>

`limit-refresh-period : 1s`
- 제한 갱신 주기
- 1초로 지정했습니다.
- 1초마다 기록했던 rate 가 리셋됩니다.
<br/>

`limit-for-period : 100`
- 갱신 주기 당 허용 호출 수
- limit-refresh-period 구간 내에서 ‘허용할 호출 수’ 를 의미합니다.
- 1초에 100번 호출 가능하다는 것을 의미합니다.
<br/>

`timeout-duration : 0s`
- 허용량 초과시 대기시간
- `0s` 는 대기하지 않고 즉시 실패하는 것을 의미합니다.
<br/>


