# 날짜 별 토픽 운영

현재 `dailyfeed` 프로젝트 에서는 날짜별 토픽을 가집니다. 토픽명은 `member-activity-{yyyyMMdd}` 와 같은 형식의 이름을 가집니다. 

![](./img/date-pattern-topic/20251230-16-12-01-1.png)

<br/>

각 날짜에 대한 토픽명이 존재하지 않는다면 `KafkaAdmin` 기능을 이용해 토픽을 새로 생성해서 해당 토픽에 메시지를 발급합니다.<br/>

e.g.
- 현재 날짜가 2025/11/27 일 이라면 : `member-activity-20251127` 
- 현재 날짜가 2025/11/28 일 이라면 : `member-activity-20251128`

<br/>

이렇게 날짜 패턴의 토픽 명을 사용하면 다음의 장점 들을 가질 수 있어서 날짜 패턴의 토픽명을 `dailyfeed` 프로젝트에 도입했습니다.
- 데이터의 오류가 있는지 등에 대한 후보정 작업에 대해 유연하게 전략을 취할 수 있다는 점
- 이미 처리 완료된 데이터에 대한 토픽(e.g. 7일 전)의 경우 토픽 삭제를 통해 카프카 브로커가 점유하는 디스크 사이즈를 줄일 수 있다는 점 (운영 비용 최적화를 위해)

<br/>

## `{topicName}-yyyyMMdd` 토픽명을 생성하는 방법들

`daliyfeed` 프로젝트에서는 두 가지 방법으로 토픽을 생성합니다.<br/>

**(1) KafkaAdmin 을 이용해 애플리케이션 기동시 토픽이 없을 경우 직접 생성**
- 애플리케이션 초기 기동시 현재 날짜, 다음 날 날짜에 대한 `{topicName}-yyyyMMdd` 토픽이 없으면 토픽을 생성 
<br/>

**(2) cronjob 을 이용해 매일 23시 50분에 다음 날자의 토픽이 없을 때 토픽을 새로 생성** 
- 매일 23시 50분에 cronjob 을 이용해서 현재 날짜 기준 다음날의 날짜에 대한 `{topicName}-yyyyMMdd` 토픽이 존재하지 않을 경우 토픽을 생성

<br/>
<br/>

## `KafkaAdmin` - 애플리케이션 초기 로딩시 토픽 없을 경우 직접 생성
이번 섹션에서는 `dailyfeed-kafka-support` 모듈에서 정의한 `TopicInitializer` 컴포넌트에 대해 설명합니다. `dailyfeed-kafka-support` 모듈에 대해서는 뒤에서 정리할 [`dailyfeed-kafka-support` 모듈](./kafka-support-모듈.md) 문서에서 `dailyfeed-kafka-support`에 대해서 개략적으로 설명할 예정입니다.<br/>

### TopicInitializer 컴포넌트
다음은 `TopicInitializer` 컴포넌트입니다.<br/>
```java
@Slf4j  
@RequiredArgsConstructor  
@Component  
public class TopicInitializer {  
    private final KafkaAdmin kafkaAdmin;  
    private static final int PARTITIONS = 6;  
    private static final int REPLICATION_FACTOR = 2;
    
    public void initializeTopics() {  
	    createTodayTopicIfNotExists();  
	    createTomorrowTopicIfNotExists(); // 23시 이후 대비  
	}
	
	@EventListener(ApplicationReadyEvent.class)  
	public void onApplicationReady() {  
	    // 애플리케이션 완전 구동 후 토픽 생성  
	    initializeTopics();  
	}
	
	private void createTodayTopicIfNotExists() {  
	    String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));  
	    createTopic(today);  
	}  
	  
	private void createTomorrowTopicIfNotExists() {  
	    String tomorrow = LocalDate.now().plusDays(1)  
	            .format(DateTimeFormatter.ofPattern("yyyyMMdd"));  
	    createTopic(tomorrow);  
	}  
	  
	private void createTopic(String dateStr){  
	    Arrays  
	            .stream(DateBasedTopicType.values())  
	            .forEach(topicType -> {  
	                createTopicIfNotExists(topicType.getTopicPrefix() + dateStr);  
	            });  
	}  
	  
	private AdminClient getAdminClient() {  
	    Map<String, Object> configs = kafkaAdmin.getConfigurationProperties();  
	    return AdminClient.create(configs);  
	}  
	  
	private void createTopicIfNotExists(String topicName) {  
	    try (AdminClient adminClient = getAdminClient()) {  
	        // 토픽 존재 여부 확인  
	        ListTopicsResult listTopics = adminClient.listTopics();  
	        Set<String> existingTopics = listTopics.names().get();  
	  
	        if (!existingTopics.contains(topicName)) {  
	            NewTopic newTopic = TopicBuilder.name(topicName)  
	                    .partitions(PARTITIONS)  
	                    .replicas(REPLICATION_FACTOR)  
	                    .config(TopicConfig.CLEANUP_POLICY_CONFIG, "delete")  
	                    .config(TopicConfig.RETENTION_MS_CONFIG, "604800000")  
	                    .build();  
	  
	            CreateTopicsResult result = adminClient.createTopics(Arrays.asList(newTopic));  
	            result.all().get(); // 완료 대기  
	            log.info("Created topic: {}", topicName);  
	        } else {  
	            log.info("Topic already exists: {}", topicName);  
	        }  
	    } catch (Exception e) {  
	        log.error("Failed to create topic: {}", topicName, e);  
	        throw new RuntimeException("Topic creation failed", e);  
	    }  
	}
}
```

위 코드의 내용이 많이 길지만, 결론만 요약해보면 "현재 날짜의 토픽, 내일 날짜의 토픽이 애플리케이션 로딩 시에 생성한다." 가 위 코드의 핵심입니다.<br/>
<br/>

함수를 기능별로 분리해서 테스트가 가능한 단위로 분리하느라 코드가 길어졌는데, 핵심적인 부분은 다음과 같습니다.
```java
@Slf4j  
@RequiredArgsConstructor  
@Component  
public class TopicInitializer {  
    private final KafkaAdmin kafkaAdmin;  
    private static final int PARTITIONS = 6;  
    private static final int REPLICATION_FACTOR = 2;
    
    // ...
    
    
    // (1)
    private void createTopic(String dateStr){  
	    Arrays  
	            .stream(DateBasedTopicType.values())  
	            .forEach(topicType -> {  
	                createTopicIfNotExists(topicType.getTopicPrefix() + dateStr);  
	            });  
	}  
	
	// (2)
	private AdminClient getAdminClient() {  
	    Map<String, Object> configs = kafkaAdmin.getConfigurationProperties();  
	    return AdminClient.create(configs);  
	}  
	
	// (3)
	private void createTopicIfNotExists(String topicName) {  
	    try (AdminClient adminClient = getAdminClient()) {  
	        // 토픽 존재 여부 확인  
	        ListTopicsResult listTopics = adminClient.listTopics();  
	        Set<String> existingTopics = listTopics.names().get();  
	  
	        if (!existingTopics.contains(topicName)) {  
	            NewTopic newTopic = TopicBuilder.name(topicName)  
	                    .partitions(PARTITIONS)  
	                    .replicas(REPLICATION_FACTOR)  
	                    .config(TopicConfig.CLEANUP_POLICY_CONFIG, "delete")  
	                    .config(TopicConfig.RETENTION_MS_CONFIG, "604800000")  
	                    .build();  
	  
	            CreateTopicsResult result = adminClient.createTopics(Arrays.asList(newTopic));  
	            result.all().get(); // 완료 대기  
	            log.info("Created topic: {}", topicName);  
	        } else {  
	            log.info("Topic already exists: {}", topicName);  
	        }  
	    } catch (Exception e) {  
	        log.error("Failed to create topic: {}", topicName, e);  
	        throw new RuntimeException("Topic creation failed", e);  
	    }  
	}
}
```
<br/>

(1) `createTopic(String dateStr)`
- `DateBasedTopicType` 이라는 enum 내에 정의된 enum 들에 대해 topicName 들을 순회하면서 `createTopicIfNotExists(topic명)` 함수를 호출합니다.

(2) `private AdminClient getAdminClient(){...}`
- `kafkaAdmin` 빈 내에 설정되어 있는 `configuration` 프로퍼티들을 `Map<String,Object>` 로 읽어온 후 이 Properties 들을 주입받은 `AdminClient` 객체를 생성합니다. 

(3) `createTopicIfNotExists(String topicName)`
- 현재 시스템에 존재하는 모든 kafka 토픽 명들을 list 로 불러온 후 `topicName` 이 존재하지 않을 경우 새로운 토픽을 생성합니다.

<br/>

참고) `DateBasedTopicType.java`<br/>
위에서 사용한 `DateBasedTopicType` 의 코드는 다음과 같습니다. 현재 애플리케이션 내에서 전역적으로 사용하는 토픽은 `member-activity-` 만 존재한다는 것을 확인할 수 있습니다.<br/>
```java
@Getter  
public enum DateBasedTopicType {  
    MEMBER_ACTIVITY("member-activity-");  
  
    private final String topicPrefix;  
  
    public static final String MEMBER_ACTIVITY_PATTERN = "member-activity-.*";  
  
    DateBasedTopicType(String topicPrefix) {  
        this.topicPrefix = topicPrefix;  
    }  
  
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");  
  
    public String generateTopicName(LocalDateTime now){  
        String currentDateStr = now.format(DATE_FORMATTER);  
        return topicPrefix + currentDateStr;  
    }  
  
    public String extractDateFromTopicName(String topicName) {  
        String prefix = topicPrefix;  
        if (topicName.startsWith(prefix)) {  
            return topicName.substring(prefix.length());  
        }  
        return null;  
    }  
  
    public String getTopicPattern(){  
        return topicPrefix + ".*";  
    }  
}
```
<br/>

### `KafkaAdmin` Bean
`TopicInitializer` 컴포넌트에서 사용하는 `KafkaAdmin` 빈이 생성되는 과정을 설명합니다.<br/>

> `KafkaAdmin` 설정은 별도로 `@Configuration`을 지정한 클래스가 없어도 `application-*.yaml` 내의 `spring.kafka.*` 설정만 있으면, KafkaAdmin 이 자동으로 활성화 됩니다.<br/>

`spring-kafka` 의존성이 클래스 패스에 있으면 `KafkaAutoConfiguration` 이 활성화 됩니다.<br/>
```kotlin
dependencies {  
    // ... 
    implementation("org.springframework.kafka:spring-kafka")
    // ...
}
```
<br/>


그리고 `spring-kafka` 는 `spring.kafka.bootstrap-servers` 설정을 읽어들여서 `KafkaAdmin` 빈을 자동으로 생성합니다.<br/>
<br/>

e.g. `application-local.yaml`<br/>
```yaml
spring:
  kafka:
    bootstrap-servers: ${KAFKA_HOST:localhost}:${KAFKA_PORT:9092}
    listener:
      ## ...
    consumer:
      ## ...
    producer:
      ## ... 
```
<br/>

### cronjob - `kafka-cli` 
애플리케이션 운영 중에 날짜가 지나갈 수록 다음 날짜에 대한 토픽이 생성되어 있지 않으면, 애플리케이션에서 kafka publish 작업을 할때 토픽이 존재하지 않아서 Exception 이 발생할 확률이 높아지게 됩니다. `dailyfeed` 프로젝트에서는 `dailyfeed-installer` 프로젝트 내에 이런 경우에 대비하기 위해서 매일 23시 50분에 `kafka-cli` 기반의 cronjob 을 실행해서 topic 이 존재하지 않을 경우 생성하는 cronjob 을 실행시키도록 정의해두었습니다.<br/>
<br/>

#### values.yaml, values-local-batch.yaml, values-dev-batch.yaml
`dailyfeed-app-helm/base-chart/dailyfeed-batch-chart/values.yaml`
```yaml
namespace: dailyfeed
imageTag: 1.0.0
appName: dailyfeed-batch
replicas: 1
profile: local
portNumber: 8080
envValues: []
configSecretItems: []
imagePullPolicy: Always

## ...

cronJobs:
  jwtKeyRotation:
    ## ...
  tokenCleanup:
    ## ...
  
  ## ...
  ## (1)
  # Kafka Topic Creator Job - 날짜 기반 토픽 사전 생성 (D+1)
  kafkaTopicCreator:
    enabled: true
    ## (2)
    # Cron 스케줄: 매일 23:50에 실행 (다음날 토픽 사전 생성)
    schedule: "50 23 * * *"
    # 동시 실행 방지
    concurrencyPolicy: "Forbid"
    # Job History 유지 개수
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 3
    # Job 완료 후 Pod 유지 시간 (초)
    ttlSecondsAfterFinished: 300
    # 재시도 횟수
    backoffLimit: 2
    # Pod 재시작 정책
    restartPolicy: "Never"
    # Kafka CLI 이미지
    image: "bitnami/kafka:3.6"
    ## (3)
    # 생성할 토픽 목록
    topics:
      - prefix: "member-activity-"
        partitions: 6
        replicationFactor: 2
        retentionMs: 604800000  # 7일
        cleanupPolicy: "delete"
    # 리소스 설정
    resources:
      memory:
        requests: "128Mi"
        limits: "256Mi"
      cpu:
        requests: "100m"
        limits: "200m"
```
<br/>

(1) `cronjobs.kafkaTopicCreator`
- cronjob 의 이름은 `kafkaTopicCreator`입니다.

(2) `cronjobs.kafkaTopicCreator.schedule: "50 23 * * *"`
- cron 의 스케쥴은 매일 23시 50분에 실행되도록 정의했습니다.

(3) `cronjobs.kafkaTopicCreator.topics`
- 배열로 정의되어 있으며 실행하는 측에서는 yaml 문법 중 `Range` 문법 통해 이 부분을 실행하기에 `cronjobs.kafkaTopicCreator.topics` 내의 모든 토픽에 대해 실행하게 됩니다.

참고)
- `dailyfeed-installer/dailyfeed-app-helm/batch/values-local-batch.yaml`, `dailyfeed-installer/dailyfeed-app-helm/batch/values-dev-batch.yaml` 모두 같은 내용이며, profile 에 따라 `values-local-batch.yaml` 이 실행되거나 `values-dev-batch.yaml` 파일이 실행됩니다.
- 위의 `values.yaml` 은 chart 를 `.tgz` 로 패키징할때는 사용되지만, 실제 실행 시에는 helm install 을 통해 실행되며 helm install 스크립트인 `dailyfeed-installer/dailyfeed-app-helm/batch/install-helm-local.sh`, `dailyfeed-installer/dailyfeed-app-helm/batch/install-helm-dev.sh` 내에서는 `values-local-batch.yaml`, `values-dev-batch.yaml`을 직접 정의해서 실행하도록 정의해두었습니다.

<br/>

#### cronjob-kafka-topic-creator.yaml
```yaml
{{- if .Values.cronJobs.kafkaTopicCreator.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ .Values.appName }}-kafka-topic-creator
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.appName }}
    job-type: kafka-topic-creator
spec:
  # Cron 스케줄 (기본: 매일 23:50)
  schedule: {{ .Values.cronJobs.kafkaTopicCreator.schedule | quote }}

  # 동시 실행 정책
  concurrencyPolicy: {{ .Values.cronJobs.kafkaTopicCreator.concurrencyPolicy }}

  # Job History 관리
  successfulJobsHistoryLimit: {{ .Values.cronJobs.kafkaTopicCreator.successfulJobsHistoryLimit }}
  failedJobsHistoryLimit: {{ .Values.cronJobs.kafkaTopicCreator.failedJobsHistoryLimit }}

  jobTemplate:
    spec:
      # Job 완료 후 Pod 유지 시간
      ttlSecondsAfterFinished: {{ .Values.cronJobs.kafkaTopicCreator.ttlSecondsAfterFinished }}

      # 재시도 횟수
      backoffLimit: {{ .Values.cronJobs.kafkaTopicCreator.backoffLimit }}

      template:
        metadata:
          labels:
            app: {{ .Values.appName }}
            job-type: kafka-topic-creator
        spec:
          restartPolicy: {{ .Values.cronJobs.kafkaTopicCreator.restartPolicy }}

          containers:
          - name: kafka-topic-creator
            image: {{ .Values.cronJobs.kafkaTopicCreator.image }}
            imagePullPolicy: {{ .Values.imagePullPolicy }}

            command:
            - /bin/sh
            - -c
            - |
              set -e

              TOMORROW=$(date -d "+1 day" +%Y%m%d 2>/dev/null || date -v+1d +%Y%m%d)
              echo "Creating topic for date: ${TOMORROW}"
			  ## (1)
              {{- range .Values.cronJobs.kafkaTopicCreator.topics }}
              TOPIC="{{ .prefix }}${TOMORROW}"
              echo "Checking topic: ${TOPIC}"

              ## (2)
              # 토픽 존재 여부 확인
              if kafka-topics.sh --bootstrap-server ${KAFKA_BOOTSTRAP_SERVERS} --list | grep -q "^${TOPIC}$"; then
                echo "Topic ${TOPIC} already exists, skipping..."
              else
                ## (3)
                echo "Creating topic ${TOPIC}..."
                kafka-topics.sh --bootstrap-server ${KAFKA_BOOTSTRAP_SERVERS} \
                  --create --topic ${TOPIC} \
                  --partitions {{ .partitions }} \
                  --replication-factor {{ .replicationFactor }} \
                  --config retention.ms={{ .retentionMs }} \
                  --config cleanup.policy={{ .cleanupPolicy }}
                echo "Topic ${TOPIC} created successfully"
              fi
              {{- end }}

              echo "Kafka topic creation job completed"

            env:
            - name: KAFKA_BOOTSTRAP_SERVERS
              valueFrom:
                secretKeyRef:
                  name: kafka-secret
                  key: KAFKA_BOOTSTRAP_SERVERS

            resources:
              requests:
                memory: {{ .Values.cronJobs.kafkaTopicCreator.resources.memory.requests }}
                cpu: {{ .Values.cronJobs.kafkaTopicCreator.resources.cpu.requests }}
              limits:
                memory: {{ .Values.cronJobs.kafkaTopicCreator.resources.memory.limits }}
                cpu: {{ .Values.cronJobs.kafkaTopicCreator.resources.cpu.limits }}
{{- end }}
```
<br/>

(1) `{{- range .Values.cronJobs.kafkaTopicCreator.topics }} {{- end }}`
- `.Values.cronJobs.kafkaTopicCreator.topics` 내에 등록한 모든 토픽들에 대해 (1),(2),(3) 의 영역이 실행됩니다.

(2) `kafka-topics.sh --bootstrap-server ${KAFKA_BOOTSTRAP_SERVERS} --list | grep -q "^${TOPIC}$"`
- kafka-cli 를 통해 `${TOPIC}` 값에 해당하는 토픽명에 대한 토픽이 존재하는지 체크합니다.

(3) `kafka-topics.sh --bootstrap-server ${KAFKA_BOOTSTRAP_SERVERS} --create --topic ${TOPIC} ...`
- kafka-cli 를 이용해 `${TOPIC}` 값에 해당하는 토픽명으로 토픽을 생성합니다.


### install-local-batch.sh, install-dev-batch.sh
install-local-batch.sh, install-dev-batch.sh 는 helm 템플릿을 install 하는 쉘스크립트입니다. 운영자 또는 개발자가 직접 매번 helm 명령을 CLI 에서 실행할수도 있겠지만, 사람이 직접 매번 떠올려서 실행할 경우 실수를 할 수 있고, 자동화를 하기에 어렵기에 쉘 스크립트로 정의해두었습니다. 이번 문서에서는 `install-local-batch.sh`만을 예로 들어서 설명하겠습니다. `install-local-batch.sh`의 내용은 다음과 같습니다.
```sh
#!/bin/bash

# Usage: ./install-helm-local.sh <IMAGE_TAG>
# Example: ./install-helm-local.sh beta-20251023-1234

if [ -z "$1" ]; then
  echo "Error: IMAGE_TAG is required"
  echo "Usage: $0 <IMAGE_TAG>"
  echo "Example: $0 beta-20251023-1234"
  return 1
fi

IMAGE_TAG=$1

helm install -n dailyfeed dailyfeed-batch \
  dailyfeed-batch-chart-1.0.0.tgz \
  -f values-local-batch.yaml \
  --set imageTag=${IMAGE_TAG}

```
<br/>


`dailyfeed` 네임스페이스에 `dailyfeed-batch` 라는 이름으로 `dailyfeed-batch-chart-1.0.0.tgz`패키지에 대해 `values-local-batch.yaml`에 정의한 속성들을 기반으로 실행하며, batch 이미지는 외부에서 주입받은 값인 `IMAGE_TAG`값을 사용합니다.<br/>
<br/>


## helm chart 내에 `cronjob-*.yaml`등록은 어떻게 되나요?
helm 은 install, upgrade 를 통해 실행될 때 다음과 같이 `/template` 내에 정의한 yaml 파일들을 직접 하나로 합쳐서 실행하게 됩니다. 즉, `/templates` 디렉터리 내에 yaml  파일들을 정의해두면 해당 yaml 파일들이 실행되게 됩니다.
```bash
dailyfeed-batch-chart
  /templates
    cronjob-jwt-key-rotations.yaml
    cronjob-kafka-topic-creator.yaml
    ...
```
<br/>

