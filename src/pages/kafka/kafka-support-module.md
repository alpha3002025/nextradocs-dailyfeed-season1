# `dailyfeed-kafka-support` 모듈 및 kafka 설정

`dailyfeed-content-svc`, `dailyfeed-activity-svc` 에서는 `spring-kafka` 를 사용합니다. 두 서비스가 같은 kafka 클러스터를 바라보며, topic 또한 같은 토픽을 사용하고 있습니다.<br/>

![](./img/kafka-support-module/20251230-16-12-42-1.png)

<br/>

 이 경우 `kafka` 관련 설정들이 중복되는 내용이 있을 수 밖에 없습니다. 이런 이유로 `dailyfeed-kafka-support`라는 모듈을 따로 생성해서 kafka 관련 설정들을 모아두게 되었습니다. <br/>
<br/>

## KafkaConfig
Kafka 설정의 주요 내용은 다음과 같습니다. 모든 내용을 설명하기는 어렵겠지만, 기본적인 설정을 제외한 세부적인 설정들에 대해 설명을 남겨두겠습니다. 프로젝트 기간 중 기본적인 설정은 직접 작성했지만, 세부적으로 심화된 설정은 Claude 를 통해 자료조사를 하고 Claude Code 를 통해 추가해나갔으며, 해당 세부 옵션들에 대한 설명들을 추가해두었습니다.<br/>

```java
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:29092,localhost:29093,localhost:29094}")
    private String bootstrapServers;

    @Value("${KAFKA_USER:}")
    private String kafkaUser;

    @Value("${KAFKA_PASSWORD:}")
    private String kafkaPassword;

    @Value("${KAFKA_SASL_PROTOCOL:PLAINTEXT}")
    private String saslProtocol;

    @Value("${KAFKA_SASL_MECHANISM:PLAIN}")
    private String saslMechanism;

    /// consumers
    private Map<String, Object> getCommonConsumerProps() {
        Map<String, Object> props = new HashMap<>();
        /// 브로커 설정
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);

        /// Deserializer 설정
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ErrorHandlingDeserializer.class);
        props.put(ErrorHandlingDeserializer.VALUE_DESERIALIZER_CLASS, JsonDeserializer.class);

        /// (1) At Least Once 관련 설정
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // 수동 커밋
        
        
//      /// Offset 설정 (오프셋 정보 없을 경우 최신 메시지부터 읽어들이는 설정)  
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");  
//        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");  
        /// Isolation Level 설정 (트랜잭션 메시지 일경우 격리수준을 'READ_COMMITTED' 로 지정)  
        props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");

        /// 성능 및 안정성 설정
        ////// (2)
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000); // 5분
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000); // 30초
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 10000); // 10초

        /// Offset 관리 및 안정성 설정 - Consumer 재시작 시 이전 메시지 재수신 방지
        ////// (3)
        props.put(ConsumerConfig.PARTITION_ASSIGNMENT_STRATEGY_CONFIG, "org.apache.kafka.clients.consumer.CooperativeStickyAssignor");

        /// Fetch 최적화 설정 - 중복 메시지 수신 방지
        ////// (4)
        props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, 1);
        props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, 500);

        /// Consumer 그룹 안정성 향상 설정
        ////// (5)
        props.put(ConsumerConfig.CONNECTIONS_MAX_IDLE_MS_CONFIG, 540000); // 9분
        props.put(ConsumerConfig.METADATA_MAX_AGE_CONFIG, 300000); // 5분

        /// 재시도 설정
        ////// (6)
        props.put(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, 60000);
        props.put(ConsumerConfig.RETRY_BACKOFF_MS_CONFIG, 100);

        /// JSON Deserializer 설정
//        props.put(JsonDeserializer.TRUSTED_PACKAGES, "click.dailyfeed.code.domain.content,click.dailyfeed.code.domain.member");
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "*");
        props.put(JsonDeserializer.USE_TYPE_INFO_HEADERS, false);

        // SASL 설정 (local 프로필에서)
        if (!kafkaUser.isEmpty() && !kafkaPassword.isEmpty()) {
            props.put("security.protocol", saslProtocol);
            props.put("sasl.mechanism", saslMechanism);
            props.put("sasl.jaas.config",
                    "org.apache.kafka.common.security.scram.ScramLoginModule required " +
                            "username=\"" + kafkaUser + "\" " +
                            "password=\"" + kafkaPassword + "\";");
        }

        return props;
    }

    // Post Activity Consumer 설정
    @Bean(name = "postActivityConsumerFactory")
    public ConsumerFactory<String, PostDto.PostActivityEvent> postActivityConsumerFactory() {
        Map<String, Object> props = getCommonConsumerProps();
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "post-activity-consumer-group");
        props.put(JsonDeserializer.VALUE_DEFAULT_TYPE, PostDto.PostActivityEvent.class.getName());
        return new DefaultKafkaConsumerFactory<>(props);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, PostDto.PostActivityEvent> postActivityKafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, PostDto.PostActivityEvent> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(postActivityConsumerFactory());

        /// At Least Once 설정
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.getContainerProperties().setSyncCommits(true);

        /// 에러 핸들링 (파티션 6개 기준)
        factory.setConcurrency(3); // 동시 처리 스레드 수
        return factory;
    }

    @Bean(name = "memberActivityConsumerFactory")
    public ConsumerFactory<String, MemberActivityTransportDto.MemberActivityEvent> memberActivityConsumerFactory() {
        Map<String, Object> props = getCommonConsumerProps();
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "member-activity-consumer-group");
        props.put(JsonDeserializer.VALUE_DEFAULT_TYPE, MemberActivityTransportDto.MemberActivityEvent.class.getName());
        return new DefaultKafkaConsumerFactory<>(props);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, MemberActivityTransportDto.MemberActivityEvent> memberActivityKafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, MemberActivityTransportDto.MemberActivityEvent> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(memberActivityConsumerFactory());

        /// At Least Once 설정
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.getContainerProperties().setSyncCommits(true);

        /// 에러 핸들링 (파티션 6개 기준)
        factory.setConcurrency(3); // 동시 처리 스레드 수
        return factory;
    }

    /// producers ///
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> configs = new HashMap<>();

        // 기본 설정
        configs.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configs.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configs.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);

        // ACK = 1 (리더 브로커만 확인)
        configs.put(ProducerConfig.ACKS_CONFIG, "1");
        // 멱등성 비활성화
        configs.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, false);

        // 성능 최적화 설정
        configs.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");
        configs.put(ProducerConfig.LINGER_MS_CONFIG, 20);
        configs.put(ProducerConfig.BATCH_SIZE_CONFIG, 32768); // 32KB
//        configs.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432);

        // 하나의 브로커 연결에서 응답을 기다리는 동안 전송할 수 있는 최대 요청 수
//        configs.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);

        // 재시도 설정
        configs.put(ProducerConfig.RETRIES_CONFIG, 3);
        configs.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, 100);

        // 타임아웃 설정
        configs.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30000);
        configs.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 60000);

        return new DefaultKafkaProducerFactory<>(configs);
    }

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }

    @Bean
    public AdminClient adminClient() {
        Map<String, Object> configs = new HashMap<>();
        configs.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        return AdminClient.create(configs);
    }
}
```
<br/>


### (1) At Least Once 관련 설정
`ENABLE_AUTO_COMMIT_CONFIG`를 `false`로 설정하면, Kafka가 알아서 오프셋을 저장하지 않습니다. 즉, **"내가 일을 다 끝냈을 때만 수동으로 저장하겠다"**는 의미입니다.<br/>
```java
/// At Least Once 관련 설정
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // 수동 커밋
// props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, true); // 자동 커밋
// props.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, 5000); // auto commit 사용하지 않지만 내부적으로 참조됨
```
<br/>

프로젝트 때도 많이 혼동했던 설정인데, 자료 조사 결과 `At Least Once` 라는 설정을 변수명 하나만 지정해서 설정할수 있는 설정 속성은 kafka 에 존재하지 않는 것으로 알고 있습니다. 대신 위와 같이 `At Least Once` 설정을 합니다. 위와 같이 `수동 커밋`을 `Off` 시켜두는 것의 의미는 다음과 같습니다.

- 수동 커밋 설정은 **"At Least Once(최소 한 번) 처리를 구현하기 위한 필수 조건"**
- 수동 커밋 설정을 해두었더라도 개발자가 커밋을 하는 코드를 작성해야 커밋이 된다는  점을 유의해야 함
- 개발자 컨슈머 코드 내의 커밋 시점에 때라 오프셋 커밋 시점이 달라짐

<br/>

At Least Once를 달성하기 위한 **표준 로직**은 다음과 같습니다:
1. **메시지 수신 (Poll)**  
2. **메시지 처리 (Process):** DB 저장, 로직 수행 등 (이 과정이 성공해야 함)
3. **수동 커밋 (Commit):** `consumer.commitSync()` 호출

<br/>

e.g. 적어도 한번 이상 커밋 되는 시나리오
- **(1)** 메시지를 받아서 **처리(2번)**까지 완벽하게 끝냈습니다.
- **(2)** 그런데 **커밋(3번)**을 하기 직전에 서버가 다운되거나 에러가 났습니다.
- **(3)** Kafka 입장에서는 "아직 처리가 안 끝났구나"라고 판단합니다. (오프셋이 갱신되지 않았으므로)
- **(4)** 컨슈머가 다시 살아나면, 아까 처리했던 그 메시지를 **다시 가져옵니다.**
- **(5)** 메시지는 **최소 한 번(성공했을 때)** 혹은 **그 이상(장애 발생 시)** 처리되므로 **At Least Once**입니다.

<br/>

이 경우 `spring-kafka`라이브러리를 사용하는 카프카 컨슈머 측의 코드는 다음과 같이 구성됩니다.
(참고 : dailyfeed-activity-svc/dailyfeed-activity 모듈 - MemberActivityEventConsumer.java)
```java
@KafkaListener(  
        topicPattern = DateBasedTopicType.MEMBER_ACTIVITY_PATTERN,  
        groupId = "member-activity-consumer-group-activity-svc",  
        containerFactory = "memberActivityKafkaListenerContainerFactory"  
)  
public void consumeAllMemberActivityEvents(  
        @Payload MemberActivityTransportDto.MemberActivityEvent event,  
        @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,  
        @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,  
        @Header(KafkaHeaders.OFFSET) long offset,  
        @Header(value = KafkaHeaders.RECEIVED_KEY, required = false) String messageKey,  
        Acknowledgment acknowledgment) {  
  
    // ... 중략 ... (애플리케이션 레벨에서의 중복 수신 체크 로직)
  
    try {  
        // ... 중략 ... 
		processEventByDate(message, dateStr);  
		/// (1)
		// 메시지 처리 성공 후 오프셋 커밋  
		acknowledgment.acknowledge();  

		kafkaMessageKeyMemberActivityRedisService.addAndExpireIn(message.getKey(), KAFKA_LISTENER_TTL);  
		log.debug("✅ Offset committed - Topic: {}, Partition: {}, Offset: {}", topic, partition, offset);  

  
    } catch (Exception e) {  
        log.error("❌ Failed to process message - Topic: {}, Partition: {}, Offset: {}, Error: {}",  
                 topic, partition, offset, e.getMessage(), e);  
        handleListenException(MemberActivityTransportDto.MemberActivityMessage.builder().key(messageKey).event(event).build());  
    }  
}
```
<br/>

**(1) 오프셋 커밋 코드 : `acknowledgment.acknowledge();`**<br/>
`acknowledgment.acknowledge();` 는 spring kafka 에서 `consumer.commitSync()`  를 대체해서 수동커밋을 수행하는 표준방식입니다. 다만 `acknowledgment.acknowledge();` 는 Spring Framework 에서 제공하는 Wrapper 기능인데, 여기서 주의해야 할 점은 **`AckMode` 가 `MANUAL` 또는 `MANUAL_IMMEDIATE`로 설정되어 있어야 한다**는 점입니다.<br/>

이 문서의 상단에 제시한 `KafkaConfig.java` 의 코드에는 `postActivityKafkaListenerContainerFactory()` 메서드가 있는데 해당 코드의 일부를 발췌해보면 다음과 같으며, `dailyfeed-kafka-support` 내에서는 AckMode 를 `MANUAL_IMMEDIATE`를 사용하고 있습니다.
```java
public class KafkaConfig {
	@Bean  
	public ConcurrentKafkaListenerContainerFactory<String, PostDto.PostActivityEvent> postActivityKafkaListenerContainerFactory() {  
	    ConcurrentKafkaListenerContainerFactory<String, PostDto.PostActivityEvent> factory =  
	            new ConcurrentKafkaListenerContainerFactory<>();  
	    factory.setConsumerFactory(postActivityConsumerFactory());  
	  
	    /// At Least Once 설정  
	    factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);  
	    factory.getContainerProperties().setSyncCommits(true);  
	  
	    /// 에러 핸들링 (파티션 6개 기준)  
	    factory.setConcurrency(3); // 동시 처리 스레드 수  
	    return factory;  
	}
}
```
<br/>
<br/>

### (2) 성능 및 안정성 설정
```java
props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);  
props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000); // 5분  
props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000); // 30초  
props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 10000); // 10초
```
 
`MAX_POLL_RECORDS_CONFIG`: 500
  - poll() 호출 시 한 번에 가져올 수 있는 최대 레코드 수
  - 500개씩 배치로 메시지를 가져오는 것을 의미합니다.

`MAX_POLL_INTERVAL_MS_CONFIG`: 300000 (5분)
  - 두 poll() 호출 사이의 최대 허용 시간
  - 이 시간 내에 다음 poll()을 호출하지 않으면 Consumer가 죽은 것으로 판단되어 리밸런싱이 발생합니다.
  - 메시지 처리 로직이 오래 걸린다면 이 값을 늘려야 합니다.

`SESSION_TIMEOUT_MS_CONFIG`: 30000 (30초)
  - Consumer가 브로커와의 세션을 유지해야 하는 시간
  - 이 시간 동안 heartbeat가 없으면 Consumer가 죽은 것으로 판단합니다.

`HEARTBEAT_INTERVAL_MS_CONFIG`: 10000 (10초)
  - Consumer가 브로커에 heartbeat를 보내는 주기
  - 일반적으로 session.timeout.ms `(SESSION_TIMEOUT_MS_CONFIG)`의 1/3 이하로 설정 (여기서는 30초의 1/3 = 10초)

<br/>

### (3) Offset 관리 및 안정성 설정 - Consumer 재시작 시 이전 메시지 재수신 방지
```java
props.put(ConsumerConfig.PARTITION_ASSIGNMENT_STRATEGY_CONFIG, "org.apache.kafka.clients.consumer.CooperativeStickyAssignor");
```

현재 코드에서는 `CooperativeStickyAssignor` 을 사용하고 있습니다. `CooperativeStickyAssignor` 은 파티션 할당 전략 중하하나입니다. **'파티션 할당 전략'**이란 Consumer Group 내의 여러 Consumer 들에게 토픽의 파티션을 어떻게 분배할지를 결정하는 방식입니다.

`CooperativeStickyAssignor` 는 다음의 특징을 가집니다.

1\.Sticky 할당 방식
- 리밸런싱 시 기존 파티션 할당을 최대한 유지
- Consumer가 이미 처리하던 파티션을 계속 담당하려 함
- 캐시 효율성 증가, 상태 유지에 유리
<br/>

2\.Cooperative (협력적) 리밸런싱
- Cooperative 방식: 필요한 파티션만 점진적으로 재할당 → 중단 최소화
<br/>


**참고: Eager 방식 리밸런싱**
- 리밸런싱 시 모든 파티션을 해제한 뒤 재할당 → 전체 Consumer 일시 중단
- Kafka 가 오래전부터 사용해온 방식이며 kafka 3.x 기준 기본 할당 전략은 RangeAssignor (Eager)
<br/>

**주요 전략들**<br/>
주요 전략들을 정리해보면 다음과 같습니다. 이번 프로젝트 내의 kafka 모듈인 `dailyfeed-kafka-support` 에서는 `CooperativeStickyAssignor`를 사용했습니다.

| 전략                        | 리밸런싱 방식     | 중단 시간      |
| ------------------------- | ----------- | ---------- |
| RangeAssignor (기본)        | Eager       | 김          |
| RoundRobinAssignor        | Eager       | 김          |
| StickyAssignor            | Eager       | 김 (할당은 유지) |
| CooperativeStickyAssignor | Cooperative | 최소         |

e.g.
Consumer A,B가 있을때 새로운 Consumer 가 추가되었을 때 파티션을 어떻게 재분배(리밸런싱)하는지를 예를 들어보면 다음과 같습니다.
```
기존: Consumer A [P0, P1, P2], Consumer B [P3, P4]
  새 Consumer C 추가 시:

  Eager 방식:
    1. A, B 모두 파티션 해제 (처리 중단)
    2. 전체 재할당: A[P0,P1], B[P3,P4], C[P2]

  Cooperative 방식:
    1. A에서 P2만 해제
    2. C에 P2 할당 (A, B는 계속 처리 중)
```
<br/>

### (4) Fetch 최적화 설정 - 중복 메시지 수신 방지
```plain
/// Fetch 최적화 설정 - 중복 메시지 수신 방지
////// (3)
props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, 1);
props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, 500);
```
<br/>

`FETCH_MIN_BYTES_CONFIG: 1`
- 브로커가 fetch 요청에 응답하기 위해 필요한 **최소 데이터 크기**
- `1`로 설정 시: 데이터가 1바이트라도 있으면 즉시 응답
- 값을 높이면: 더 많은 데이터가 쌓일 때까지 대기 → 배치 효율 증가, 지연 시간 증가

`FETCH_MAX_WAIT_MS_CONFIG: 500`
- `FETCH_MIN_BYTES`를 충족하지 못해도 **최대 대기 시간** (밀리초)
- `500ms`로 설정 시: 최소 바이트를 못 채워도 500ms 후에는 응답
- `FETCH_MIN_BYTES`와 함께 동작하여 지연 시간 상한을 보장

<br/>

두 설정을 조합하는 여러 경우들을 따져보면 다음과 같습니다.

| FETCH_MIN_BYTES | FETCH_MAX_WAIT_MS | 특성                    |
| --------------- | ----------------- | --------------------- |
| 낮음 (1)          | 낮음 (500ms)        | 낮은 지연, 빈번한 요청 (현재 설정) |
| 높음              | 높음                | 높은 처리량, 높은 지연         |
| 높음              | 낮음                | 처리량과 지연 균형            |
<br/>

현재 설정은 다음과 같습니다.
- `FETCH_MIN_BYTES=1` + `FETCH_MAX_WAIT_MS=500`
- **지연 시간(latency) 최소화** 우선
- 메시지가 도착하면 즉시 가져오되, 최대 500ms만 대기
- 실시간성이 중요한 서비스에 적합
<br/>

`FETCH_MAX_WAIT_MS` 의 경우 약간은 오버해서 설정한 면이 좀 있긴 합니다. 하지만 안전성을 위해 추가해둔 설정입니다. 장애가 발생한다거나 하는 상황을 대비해서 최소 응답 지연시간을 설정할수 있다고 생각해서 `claude code` 가 추가해준 추천을 삭제하지 않고 그대로 두었습니다<br/>
<br/>

### (5) Consumer 그룹 안정성 향상 설정
```
/// Consumer 그룹 안정성 향상 설정
////// (5)
props.put(ConsumerConfig.CONNECTIONS_MAX_IDLE_MS_CONFIG, 540000); // 9분
props.put(ConsumerConfig.METADATA_MAX_AGE_CONFIG, 300000); // 5분
```
<br/>

**`CONNECTIONS_MAX_IDLE_MS_CONFIG: 540000 (9분)`**
- 브로커와의 **유휴 연결을 유지하는 최대 시간**
- 이 시간 동안 사용되지 않은 연결은 자동으로 종료됨
- 기본값: 540000ms (9분)

의미
- 연결을 너무 빨리 끊으면 재연결 비용 발생
- 너무 오래 유지하면 리소스 낭비
- 9분은 일반적으로 적절한 균형점
<br/>

**`METADATA_MAX_AGE_CONFIG: 300000 (5분)`**
- Consumer가 **메타데이터를 강제로 갱신하는 주기**
- 메타데이터: 토픽, 파티션, 리더 브로커 정보 등
- 이 시간이 지나면 변경이 없어도 메타데이터를 새로 요청
<br/>

메타데이터 갱신이 필요한 경우는 다음과 같습니다.
- 브로커 추가/제거
- 파티션 수 변경
- 리더 브로커 변경

의미
- 5분마다 클러스터 상태를 갱신하여 최신 정보 유지
- 너무 짧으면 불필요한 네트워크 오버헤드 발생
- 너무 길면 클러스터 변경 감지가 늦어짐

<br/>


종합해보면 `CONNECTIONS_MAX_IDLE_MS_CONFIG`, `METADATA_MAX_AGE_CONFIG` 설정이 적용된 내용은 다음과 같습니다.
- 메타데이터는 5분마다 갱신되므로 연결이 활성 상태 유지
- 연결 유지 시간(9분) \> 메타데이터 갱신 주기(5분)
- 이 관계로 인해 **불필요한 재연결 없이 안정적인 연결 유지**
<br/>

사용하지 않는 연결을 정리하는 기간을 9분을 두었고, 메타데이터 갱신 역시 너무 잦은 연산을 하지 않도록 5분으로 두었습니다. 5분으로 설정한 이유는 인프라에 변경사항을 자동으로 반영하려하는 주기가 너무 짧을 경우 예상치 못한 상황에 대비하기 어려운 면도 있기 때문에 5분으로 잡은 것도 어느 정도 타당해 보입니다.<br/>
<br/>

### (6) 재시도 설정
```plain
/// 재시도, Timeout 설정
////// (6)
props.put(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, 60000);
props.put(ConsumerConfig.RETRY_BACKOFF_MS_CONFIG, 100);
```

`REQUEST_TIMEOUT_MS_CONFIG: 60000`
- Consumer 가 `kafka` 브로커로부터 응답을 기다리는 최대 시간을 지정하는데 밀리세컨드 단위로 지정합니다.
- 만약 이 시간 내로 브로커로부터 응답을 받지 못하면 해당 요청은 실패로 간주되어 재시도 됩니다.
- 현재 코드에서는 60초로 설정했습니다.

`RETRY_BACKOFF_MS_CONFIG: 100`
- 실패한 요청에 대해 재시도를 수행하기 전에 Consumer가 대기하는 시간을 지정하는데 밀리세컨드 단위로 지정합니다.
- 장애 발생시 재시도를 즉시 수행하는 요청이 여러 Consumer 들로부터 발생하면, 부하가 발생하게 되므로 재시도를 시작하기 전까지 얼마정도의 텀을 둘지를 설정하는 속성입니다.
- 현재 코드에서는 100ms (0.1초) 로 설정했습니다.

<br/>

## 그외 기타 설정
이 외에도 현재 프로젝트에서 사용하는 설정 중 하나는 `TopicInitializer`인데, 여기에 대해서는 [날짜 별 토픽 운영](./4.날짜-별-토픽-운영.md) 에 정리해두었습니다.<br/>
<br/>


## helper 클래스
kafka 통신을 수행하는 코드의 경우 하드코딩된 코드 들을 애플리케이션 전역에 그대로 두기보다는, `dailfyeed-kafka-support`라는 모듈 내에 `KafkaHelper` 라는 클래스 내에 관련 코드를 하나의 기능으로 응축시켜두었습니다.
```java
package click.dailyfeed.kafka.domain.kafka.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@RequiredArgsConstructor
@Component
public class KafkaHelper {
    private final KafkaTemplate<String, Object> kafkaTemplate;

	/// (1)
    public <T> void send(String topicName, String key, T payload) {
        kafkaTemplate.send(topicName, key, payload)
                .whenComplete((result, throwable) -> {
                    if (throwable != null) {
                        log.error("Failed to send post activity event to topic: {}, key: {}",
                                topicName, key, throwable);
                    } else {
                        log.info("Successfully sent post activity event to topic: {}, postId: {}",
                                topicName, key);
                    }
                });
    }

    public LocalDateTime currentDateTime() {
        return LocalDateTime.now();
    }
}

```
<br/>

(1)
- `spring-kafka` 에서 지원하는 KafkaTemplate 을 이용해 데이터를 전송하는 코드입니다.

<br/>


## 메시지 발송(publish) 코드의 컴포넌트화
메시지 발송 코드를 `-Publisher` 접미사를 갖는 클래스에 컴포넌트화 해두었습니다. 내용은 간단하므로 부가적인 설명은 생략하겠습니다.
```java
@Slf4j
@RequiredArgsConstructor
@Component
public class MemberActivityKafkaPublisher {
    private final KafkaHelper kafkaHelper;
    private final DateBasedTopicResolver dateBasedTopicResolver;
    private final KafkaMessageKeyMemberActivityRedisService kafkaMessageKeyMemberActivityRedisService;

    /// post
    public void publishPostReadEvent(Long memberId, Long postId){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newPostMemberActivityTransportDto(memberId, postId, MemberActivityType.POST_READ, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, MemberActivityType.POST_READ, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    public void publishPostCUDEvent(Long memberId, Long postId, MemberActivityType activityType){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newPostMemberActivityTransportDto(memberId, postId, activityType, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, activityType, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    /// comment
    public void publishCommentReadEvent(Long memberId, Long postId, Long commentId){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newCommentMemberActivityTransportDto(memberId, postId, commentId, MemberActivityType.COMMENT_READ, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, MemberActivityType.COMMENT_READ, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    public void publishCommentCUDEvent(Long memberId, Long postId, Long commentId, MemberActivityType activityType){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newCommentMemberActivityTransportDto(memberId, postId, commentId, activityType, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, activityType, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    /// post (like)
    public void publishPostLikeEvent(Long memberId, Long postId, MemberActivityType activityType){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newPostLikeMemberActivityTransportDto(memberId, postId, activityType, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, activityType, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    /// comment (like)
    public void publishCommentLikeEvent(Long memberId, Long postId, Long commentId, MemberActivityType activityType){
        LocalDateTime now = kafkaHelper.currentDateTime();
        String topicName = dateBasedTopicResolver.resolveDateBasedTopicName(DateBasedTopicType.MEMBER_ACTIVITY, now);

        MemberActivityTransportDto.MemberActivityEvent event = MemberActivityTransferDtoFactory
                .newCommentLikeMemberActivityTransportDto(memberId, postId, commentId, activityType, now);

        MemberActivityTransportDto.MemberActivityMessage message = MemberActivityTransferDtoFactory
                .newMemberActivityMessage(event, activityType, now);

        if (message.getKey() == null){
            throw new KafkaMessageKeyCreationException();
        }

        if (RedisKeyExistPredicate.EXIST.equals(kafkaMessageKeyMemberActivityRedisService.checkExist(message.getKey()))){
            throw new DailyfeedWebTooManyRequestException();
        }

        try{
            kafkaHelper.send(topicName, message.getKey(), message.getEvent());
        }
        catch (Exception e){
            throw new KafkaNetworkErrorException();
        }
    }

    /// member
}
```
<br/>

