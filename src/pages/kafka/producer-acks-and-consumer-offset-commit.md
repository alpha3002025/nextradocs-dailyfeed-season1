# Producer Ack 설정, Consumer Offset Commit 설정

kafka 설정 시 여러가지 요소들이 있지만, 가장 핵심적인 요소는 Producer Acknowledgement, Consumer Offset 커밋 방식일 것이라고 생각합니다.
dailfyeed 에서는 Producer Acknowledgement, Consumer Offset 커밋 방식을 다음과 같이 지정했습니다.<br/>

`Producer Acknowledgement`
- **Acks=1 선택**
- 리소스/비용을 줄이기 위해 리더파티선 1기 까지만 운영하는 경우를 고려했습니다.
- 리더파티션 까지만 복제되는 것을 보장합니다.
<br/>

`Consumer Offset` 커밋 방식
- **`At Least Once` 를 선택했습니다.**
- 중복된 메시지를 받더라도 Redis 를 통해 중복 메시지를 체크하고, 데이터 저장 시에도 같은 메시지일 경우 upsert 하도록 지정했습니다.
- `3. 중복 메시지 체크 방식` 문서에서 `메시지`를 고유하게 인식할 수 있는 `메시지 키`의 형식에 대해 정리합니다.
<br/>

KafkaConfig.java 의 자세한 내용을 확인하고자 하신다면 [kafka-support 모듈](./6.kafka-support-모듈)페이지를 확인해주세요.<br/>
<br/>


## Producer Acknowledgement (Acks)

Producer Acknowledgement 방식은 다음의 3가지가 있습니다.
- acks = 1 (dailyfeed 프로젝트에서 사용)
- acks = 0
- acks = all (-1)
<br/>

이 중 dailyfeed 프로젝트에서는 `acks = 1` 옵션을 사용하고 있습니다.<br/>
<br/>

### acks = 1 (선택)
- Producer 가 메시지를 브로커에 보낼때 리더파티션에 메시지를 보낸 후, 리더파티션이 메시지를 받아서 로그에 쓴 후 리더로부터 ack 을 받는 방식입니다.<br/>
<br/>

### acks = 0
- Producer 가 메시지를 브로커에 보낼때 메시지를 보내기만 하고 ack 를 기다리지 않는 방식입니다.<br/>
<br/>

### acks = all (-1)
- Producer 가 메시지를 브로커에 보낼때 메시지를 보낸 후 리더파티션 & 모든 ISR 이 메시지를 받은 후 ack 을 받는 방식입니다.
- 복제본에 모두 복제가 이뤄져야 acks 를 받습니다.
<br/>

KafkaConfig.java 의 자세한 내용을 확인하고자 하신다면 [kafka-support 모듈](./6.kafka-support-모듈)페이지를 확인해주세요.<br/>
<br/>

## Consumer Offset Commit 방식

Consumer Offset Commit 방식은 다음의 3가지가 있습니다.
- At Most Once (최대 한번)
- At Least Once (최소 한번) (dailyfeed 프로젝트에서 사용)
- Exactly Once (정확히 한번)
<br/>

이 중 dailyfeed 프로젝트에서는 `At Least Once (최소 한번)` 옵션을 사용하고 있습니다.<br/>
<br/>

### At Most Once (최대 한번)
- Offset 을 먼저 커밋하고, 나중에 처리하는 방식입니다. 
- 처리 중 실패할 경우 메시지가 손실됩니다. 최대 1번 처리됩니다. 
- 메시지의 중복처리는 없지만, 데이터 손실가능성이 존재합니다.
- 예를 들면 미디어 스트리밍 처럼 실시간 중계를 할 경우에 선택할 수 있는 방식입니다.
<br/>

### At Least Once (최소 한번) (선택)
- 처리를 먼저 하고 Offset을 나중에 커밋하는 방식입니다. 처리 후 커밋 전 실패할 경우 재처리 됩니다.(커밋이 안된 메시지는 재수신)
- 데이터의 손실은 없지만 메시지가 중복 수신 됩니다. 따라서 애플리케이션 레벨에서 메시지 중복 시에 대한 처리를 해주면 메시지 유실 없이 카프카 통신이 가능합니다.
가장 일반적으로 사용되는 방식입니다.
<br/>

### Exactly Once (정확히 한번)  
- 처리와 커밋이 하나의 트랜잭션으로 묶입니다. 둘 다 성공하거나 둘 다 실패합니다. 정확히 1번 처리됩니다.
- 중복처리가 없고 데이터 손실 역시 없는 방식이지만 성능 오버헤드가 있으며 구현이 복잡하고 추가설정이 필요합니다.
- 모든 파티션에 복제를 해야 하기 때문에 성능 면에서는 좋지 않습니다.
<br/>

KafkaConfig.java 의 자세한 내용을 확인하고자 하신다면 [kafka-support 모듈](./6.kafka-support-모듈)페이지를 확인해주세요.<br/>
<br/>


## 참고
혹시 kafka 에 대한 개념이 부족하시다면 https://alpha3002025.github.io/docs-kafka-summary/kafka-concepts/kafka-basic/ 을 참고해주세요.<br/>
<br/>

KafkaConfig.java 의 자세한 내용을 확인하고자 하신다면 [kafka-support 모듈](./6.kafka-support-모듈)페이지를 확인해주세요.<br/>
<br/>

