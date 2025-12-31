# dailyfeed-installler, dailyfeed-infrastructure, dailyfeed-app-helm 설명

dailyfeed-installer 프로젝트 내에는 dailyfeed-infrastructure, dailyfeed-app-helm 모듈이 있습니다. 각각은 초기 개발 시에는 모두 local 프로필에 대해서는 수작업으로 하나씩 쉘스크립트를 작성하고 실행 구조를 정의했고, local 프로필에 대한 스크립트가 한벌이 만들어졌을때 이 local 프로필 기반의 스크립트들을 기반으로 dev 프로필 기반의 스크립트 들을 AI 에이전트(Claude Code)를 이용해서 dev 프로필 기반의 스크립트를 만들었습니다.<br/>

처음부터 대부분의 내용을 AI 를 이용해서 인프라 스크립트를 작성하면 AI 와 결국엔 싸우게 될것 같아서... 처음에는 원래 알고 있던 지식을 기반으로 구조를 잡으면서 디버깅을 할때에만 AI의 도움을 받았고, 완성된 한 벌이 만들어졌을 때 부터는 AI를 이용해서 dev 기반의 스크립트, local-hybrid 기반의 스크립트를 구성했습니다.<br/>
<br/>

```
dailyfeed-installer
  ㄴ dailyfeed-infrastructure
  ㄴ dailyfeed-app-helm
```
<br/>

**`dailyfeed-infrastructure`** 는 MySQL, MongoDB, Kafka, Redis 를 local, local-hybrid, dev 환경에 맞도록 설치하는 스크립트들을 관리하는 서브모듈입니다. https://github.com/alpha3002025/dailyfeed-infrastructure 에 개별 리포지터리가 존재하며 dailyfeed-installer (https://githib.com/alpha3002025/dailyfeed-installer) 내에 git submodule 로 등록되어있습니다.<br/>

**`dailyfeed-app-helm`** 은 모든 서비스 애플리케이션 들에 대한 helm 을 관리하는 프로젝트입니다. https://github.com/alpha3002025/dailyfeed-installer (https://githib.com/alpha3002025/dailyfeed-installer) 내에 git submodule 로 등록되어있습니다.<br/>
<br/>

각각의 shell script 를 호출하는 구조는 다음과 같습니다.<br/>

![](./img/dailyfeed-installer-dailyfeed-infrastructure-dailyfeed-app-helm/20251231-16-12-01-1.png)

<br/>
<br/>



# `dailyfeed-infrastructure`
> Project Github : https://github.com/alpha3002025/dailyfeed-infrastructure

<br/>

infrastructure 를 설치하는 과정에 대한 프로젝트입니다. `dailyfeed-infrastructure/install-local-hybrid.sh` 를 통해 infra 들이 설치되며 다음의 작업들을 수행합니다.<br/>
- `Kind` 기반의 k8s 클러스터 설치
- `MySQL, MongoDB, Kafka, Redis` 를 docker-compose 기반으로 설치
- `Kind` 의 control plane 컨테이너, worker node 컨테이너 들을 docker-compose 네트워크에 connect
<br/>

**`install-local.sh` -`local` 설치 스크립트**<br/>
> 참고 : `dailyfeed-infrastructre/install-local.sh`<br/>

개발 초반에는 `install-local.sh` 에 설치 스크립트를 작성했고, 이 스크립트 내에서는 MySQL, MongoDB, Kafka, Redis 를 모두 helm 으로 함께 kubernetes 클러스터 내에 함께 설치하도록 되어 있습니다. 하지만 이 방식은 kubernetes 내에 MySQL, MongoDB, Kafka, Redis 를 helm 으로 배포했기에 서비스 애플리케이션들과 클러스터의 리소스를 공유하게 되기에 애플리케이션의 정확한 리소스 사용량을 파악하기 쉽지 않다는 단점이 있었습니다. 또한 HPA 설정 시 인프라(MySQL, MongoDB, Kafka, Redis)와 서비스 애플리케이션 간 리소스 경합이 발생하기에 HPA 설정시 정확한 리소스 사용량 부여에 어려움을 겪게 되었습니다.<br/>

즉, 인프라(MySQL, MongoDB, Kafka, Redis) 리소스와 서비스 애플리케이션 리소스 간 분리가 이뤄지지 않아서 서로에게 영향을 주는 현상이 있었습니다. 이런 이유로 아래에서 설명할 `install-local-hybrid.sh` 스크립트로의 전환 작업을 시작하게 됐습니다.<br/>
<br/>

**`install-local-hybrid.sh` - `local` ➝ `local-hybrid`**<br/>
> 참고 : `dailyfeed-infrastructre/install-local.sh`<br/>

이 방식은 인프라(MySQL, MongoDB, Kafka, Redis)는 `docker-compose.yaml` 기반으로 작성합니다. 그리고 서비스 애플리케이션 들은 helm 을 통해 배포됩니다. 인프라(MySQL, MongoDB, Kafka, Redis) 영역은 별도의 영역에서 실행되며, HPA 로 클러스터 내에서 관리되어야 할 서비스 애플리케이션들온 helm 을 통해 쿠버네티스에서 실행되도록 했습니다.<br/>

- 인프라(MySQL, MongoDB, Kafka, Redis) : Docker Compose 기반으로 설치, 독립된 영역에 설치 (dailyfeed-infrastructure 에 정의)
- 서비스 애플리케이션 : helm 기반으로 설치, kind 기반 kubernetes 내에 설치 (dailyfeed-app-helm 내에 정의)

이때 서로 분리된 영역에서 인프라와 서비스 애플리케이션이 동작하기에 서로의 docker network 를 연결시켜줘야 하는데, 이 작업은 kind 의 control plane node, worker node 의 각 컨테이너에 docker connect 를 통해 각 network 를 연결해주는 script 를 추가해서 해결했으며 관련된 소스코드의 일부는 다음과 같습니다.<br/>
<br/>


**`dailyfeed-infrastructure/install-local-hybrid.sh`**<br/>
```sh

### ...


# Kind 클러스터의 컨테이너를 dailyfeed-network에 연결
NETWORK_NAME="local-hybrid_dailyfeed-network"

# Kind 컨트롤 플레인 노드 연결
KIND_CONTROL_PLANE="istio-cluster-control-plane"
if docker ps --format '{{.Names}}' | grep -q "^${KIND_CONTROL_PLANE}$"; then
    echo "  → Connecting ${KIND_CONTROL_PLANE} to ${NETWORK_NAME}..."
    docker network connect ${NETWORK_NAME} ${KIND_CONTROL_PLANE} 2>/dev/null || echo "  ✓ Already connected"
else
    echo "  ⚠️  ${KIND_CONTROL_PLANE} not found"
fi

# Kind 워커 노드들 연결 (있는 경우)
for worker in $(docker ps --format '{{.Names}}' | grep "^istio-cluster-worker"); do
    echo "  → Connecting ${worker} to ${NETWORK_NAME}..."
    docker network connect ${NETWORK_NAME} ${worker} 2>/dev/null || echo "  ✓ Already connected"
done

echo "  ✅ Network connection completed"
echo ""

echo "=== 🔗 Connecting Docker Compose infrastructure to Kind network ==="
echo "This allows bidirectional communication between Docker Compose and Kubernetes"

# Docker Compose 인프라 컨테이너들을 Kind 네트워크에 연결
KIND_NETWORK="kind"

# Kafka 브로커들 연결
for kafka in kafka-1 kafka-2 kafka-3; do
    if docker ps --format '{{.Names}}' | grep -q "^${kafka}$"; then
        echo "  → Connecting ${kafka} to ${KIND_NETWORK}..."
        docker network connect ${KIND_NETWORK} ${kafka} 2>/dev/null || echo "  ✓ Already connected"
    else
        echo "  ⚠️  ${kafka} not found"
    fi
done

# MongoDB 레플리카셋 연결
for mongo in mongo-dailyfeed-1 mongo-dailyfeed-2 mongo-dailyfeed-3; do
    if docker ps --format '{{.Names}}' | grep -q "^${mongo}$"; then
        echo "  → Connecting ${mongo} to ${KIND_NETWORK}..."
        docker network connect ${KIND_NETWORK} ${mongo} 2>/dev/null || echo "  ✓ Already connected"
    else
        echo "  ⚠️  ${mongo} not found"
    fi
done

# Redis 연결
if docker ps --format '{{.Names}}' | grep -q "^redis-dailyfeed$"; then
    echo "  → Connecting redis-dailyfeed to ${KIND_NETWORK}..."
    docker network connect ${KIND_NETWORK} redis-dailyfeed 2>/dev/null || echo "  ✓ Already connected"
else
    echo "  ⚠️  redis-dailyfeed not found"
fi

# MySQL 연결
if docker ps --format '{{.Names}}' | grep -q "^mysql-dailyfeed$"; then
    echo "  → Connecting mysql-dailyfeed to ${KIND_NETWORK}..."
    docker network connect ${KIND_NETWORK} mysql-dailyfeed 2>/dev/null || echo "  ✓ Already connected"
else
    echo "  ⚠️  mysql-dailyfeed not found"
fi

echo "  ✅ Infrastructure network connection completed"
```
<br/>

**`install-dev.sh`**<br/>
> 참고: `dailyfeed-infrastructure/install-dev.sh`<br/>

MySQL, MongoDB 를 외부 클라우드 업체에서 제공하는 것을 사용하는 버전의 설치 스크립트입니다. `install-local.sh`를 만들때 들었던 시간과 정성을 `install-dev.sh`에도 똑같이 쏟아부을 수 여건이 되지 않아서 시간관계상 AI 를 활용해야 했고, `install-dev.sh` 의 경우 Claude Code 내에서 `install-local.sh` 를 참고해서 `install-dev.sh`에서 사용할 dev 환경의 RDS, Atlas Mongodb 의 주소 세팅, 접속 계정 등을 Secret,Service 등을 통해 지정햐도록 했습니다.<br/>

Claude Code 도 한번에 정확한 답을 내지는 않기에 자주 확인 후 증상을 수정해나가는 과정을 거쳤으며, 서비스 애플리케이션 측 코드를 local 환경에서 개발 작업을 하면서 주기적으로 Claude Code 로 작업이 진행된 내용을 확인하면서 인프라 쪽의 작업도 확인해나가는 과정을 거쳤습니다.<br/>

dev 환경의 경우 `install-dev.sh`는 아직 완전하게 마음에 들지는 않습니다. 접속 계정, 접속 주소 등을 secret 에 BASE64 인코딩을 해서 평문으로만 들어가지 않도록 해두어 github repository 내의 인프라 주소가 평문 검색으로 조회되지 않도록 해두었다는 것 만으로는 아직까지는 만족감을 느끼지는 않지만, 시간 관계상 이 정도 까지만 완성을 해두기로 결정했습니다.<br/>
<br/>

현재 dev 환경의 infra 는 로컬에서만 접속이 됩니다. 클라우드 인프라 내에 dev 프로필로 애플리케이션들을 올려두기에는 비용상으로 압박이 좀 있기에, 로컬에서 dev 프로필로 접속이 되도록 해두었고, 클라우드 인프라 내에 모든 애플리케이션을 배포했을 때 이론상으로는 모두 이상 없이 동작한다고 볼수는 있지만, 실제 dev 환경을 구성하지는 않았습니다.<br/>
<br/>

season 2 로 개발하려는 새로운 버전의 프로젝트에서는 로컬에서 dev 인프라에 접속할때에 대해 접속주소 등을 가지고 있는 docker image 기반의 소형 애플리케이션을 미리 만들어서, 이 애플리케이션을 sidecar 로 두어서 배포하거나, Config Server를 운영하거나 하는 등의 전략들을 생각 중 입니다.<br/>
<br/>


# dailyfeed-app-helm
> Project Github : https://github.com/alpha3002025/dailyfeed-app-helm

모든 서비스 애플리케이션들의 helm 차트 들을 관리하는 리포지터리입니다. dailyfeed-installer (https://githib.com/alpha3002025/dailyfeed-installer) 내에 git submodule 로 등록되어있습니다. 개발 초창기에는 `dailyfeed-infrastructure` 내에서 인프라설치 스크립트와 애플리케이션 차트 설정/배포 스크립트들을 함께 관리하다가 유지보수의 효율성을 위해 `dailyfeed-app-helm` 이라는 별도의 github project repository 에 분리해두었고, 관리의 효율성을 위해 `dailyfeed-installer` git 프로젝트 내의 git submodule 로 등록해두었습니다.<br/>
<br/>

## base-chart
base-chart 에는 중복되는 템플릿을 공통화 해둔 base 성격의 chart 들을 모아두며, 두 가지의 base chart 들을 분류해두었습니다.
```plain
dailyfeed-app-helm
 ㄴ base-chart
     ㄴ dailyfeed-backend-chart
     ㄴ dailyfeed-batch-chart
```
<br/>
- dailyfeed-backend-chart : 백엔드 서비스의 공통되는 설정,템플릿들을 base 설정으로 분류 및 정의
- dailyfeed-batch-chart : 백엔드 중 batch 의 설정, 템플릿을 base 설정으로 분류 및 정의
<br/>
<br/>

### base-chart/dailyfeed-backend-chart
Batch 를 제외한 모든 백엔드 서비스들은 Spring Boot 기반의 프로젝트이며, deploy.yaml 의 구조 역시 비슷합니다. 이런 구조를 적용해야 하는 프로젝트들은 다음과 같았습니다.
- dailyfeed-member-svc
- dailyfeed-content-svc
- dailyfeed-timeline-svc
- dailyfeed-search-svc
- dailyfeed-image-svc
- dailyfeed-activity-svc

위의 서비스들 각각의 deploy.yaml 을 별도로 관리하는 것은 개발 작업 초창기에는 그렇게 힘든 작업이 아닙니다. 하지만, 계속해서 개발작업을 할 때마다 한 곳에 변경작업이 생겼을 때 N-1 개의 프로젝트에 모두 똑같이 복사해줘야 하고, 사람이 직접 복사해서 넣을 경우 실수의 소지 역시 있습니다. 예를 들어 docker image 를 docker hub 를 쓰던 것을 `ghcr.io` 를 사용하기로 결정했을 경우 `deploy.yaml`을 개별 서비스 프로젝트에서 정의하고 있다면, 모두 하나 하나 일일이 수정해줘야 하며, 그중 빼뜨린것이 있는지 혼동될 경우 역시 있습니다.<br/>

그런데 `base-chart/dailyfeed-backend-chart` 내에 공통으로 쓰이는 템플릿을 추상화해둔 현재의 구조라면 `dailyfeed-app-helm/base-chart/dailyfeed-backend-chart/templates/deploy.yaml` 내에 다음과 같이 해당 부분만 수정해주면 됩니다.<br/>
<br/>

**e.g. `dailyfeed-app-helm/base-chart/dailyfeed-backend-chart/templates/deploy.yaml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  ## ...
spec:
  ## ...
  strategy: 
    type: RollingUpdate
  template:
    metadata:
    ## ...
    spec:
      containers:
      - image: ghcr.io/alpha3002025/{{ .Values.appName }}-svc:{{ .Values.imageTag }}
	  ## ...
```
<br/>

#### templates/deploy.yaml
2025.12.03 현재 backend `deploy.yaml` 의 내용은 다음과 같습니다.<br/>
**e.g. `dailfyeed-app-helm/base-chart/dailyfeed-backend-chart/templates/deploy.yaml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: {{ .Values.appName }}
  name: {{ .Values.appName }}
  namespace: {{ .Values.namespace }}
spec:
  replicas: {{ .Values.replicas }}
  selector:
    matchLabels:
      app: {{ .Values.appName }}
  strategy: 
    type: RollingUpdate
  template:
    metadata:
      annotations:
        sidecar.istio.io/rewriteAppHTTPProbers: "true"
        traffic.sidecar.istio.io/excludeOutboundPorts: "9092,27017,3306,6379"
      labels:
        app: {{ .Values.appName }}
    spec:
      containers:
      - image: ghcr.io/alpha3002025/{{ .Values.appName }}-svc:{{ .Values.imageTag }}
        imagePullPolicy: {{ .Values.imagePullPolicy }}
        name: {{ .Values.appName }}
        ports:
        - containerPort: {{ .Values.portNumber }}
        env:
        - name: JAVA_TOOL_OPTIONS
          value: "-Djava.net.preferIPv4Stack=true"
        - name: SPRING_PROFILES_ACTIVE
          value: {{ .Values.profile }}
        - name: SERVER_PORT
          value: "{{ .Values.portNumber }}"
        {{- with .Values.envValues }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        {{- if .Values.debugValues}}
        {{- with .Values.debugValues}}
        {{- toYaml . | nindent 8 }}
        {{- end}}
        {{- end}}
        {{- if .Values.configSecretItems}}
        envFrom:
          {{- range .Values.configSecretItems }}
          - configMapRef:
              name: {{ . | trimSuffix "-nosecret" }}-config
          {{- if not (hasSuffix "-nosecret" .)}}
          - secretRef:
              name: {{ . }}-secret
          {{- end}}
          {{- end}}
        {{- end}}
        resources: 
          requests:
            memory: {{ .Values.resources.memory.requests }}
            cpu: {{ .Values.resources.cpu.requests }}
          limits:
            memory: {{ .Values.resources.memory.limits }}
            cpu: {{ .Values.resources.cpu.limits }}
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 10"]
        {{- with .Values.probeValues.readiness }}
        readinessProbe:
          httpGet:
            path: {{ .httpGetPath }}
            port: {{ $.Values.portNumber }}
          initialDelaySeconds: {{ .initialDelaySeconds }}
          periodSeconds: {{ .periodSeconds }}
          successThreshold: {{ .successThreshold }}
          failureThreshold: {{ .failureThreshold }}
        {{- end }}
        {{- with .Values.probeValues.liveness }}
        livenessProbe:
          httpGet:
            path: {{ .httpGetPath }}
            port: {{ $.Values.portNumber }}
          initialDelaySeconds: {{ .initialDelaySeconds }}
          periodSeconds: {{ .periodSeconds }}
          failureThreshold: {{ .failureThreshold }}
        {{- end}}
        {{- with .Values.probeValues.startup}}
        startupProbe:
          httpGet:
            path: {{ .httpGetPath }}
            port: {{ $.Values.portNumber }}
          initialDelaySeconds: {{ .initialDelaySeconds }}
          periodSeconds: {{ .periodSeconds }}
          failureThreshold: {{ .failureThreshold }}
        {{- end}}
        {{- if .Values.persistence }}
        {{- if .Values.persistence.enabled }}
        volumeMounts:
        - name: {{ .Values.appName }}-storage
          mountPath: {{ .Values.persistence.mountPath }}
        {{- end }}
        {{- end }}
      {{- if .Values.persistence }}
      {{- if .Values.persistence.enabled }}
      volumes:
      - name: {{ .Values.appName }}-storage
        persistentVolumeClaim:
          claimName: {{ .Values.appName }}-claim
      {{- end }}
      {{- end }}
status: {}
```
<br/>

환경변수 들의 경우 반복문/조건문을 기반으로 속성들을 주입하는 코드들을 볼 수 있습니다. 이 때 base-chart 내에서 참조하는 `values.yaml`파일은 **`dailfyeed-app-helm/base-chart/dailyfeed-backend-chart/values.yaml`** 입니다.<br/>

#### values.yaml
e.g. **`dailfyeed-app-helm/base-chart/dailyfeed-backend-chart/values.yaml`**<br/>
```yaml
namespace: dailyfeed
imageTag: 0.0.1
appName: dailyfeed-backend
replicas: 1
profile: local
portNumber: 8080
envValues: []
configSecretItems: []
imagePullPolicy: Always
resources:
  memory:
    requests: "500Mi"
    limits: "1Gi"
  cpu:
    requests: "500m"
    limits: "1000m"
probeValues:
  readiness:
    httpGetPath: /healthcheck/ready
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 3
  liveness:
    httpGetPath: /healthcheck/live
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 7
  startup:
    httpGetPath: /healthcheck/startup
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 3
persistence:
  enabled: false
  storageClass: local-path
  storageRequest: "1Gi"
  accessModes:
  - ReadWriteOnce
  mountPath: /image

```
<br/>

### 패키징 (tgz)
이렇게 작성한 차트는 패키징을 통해 압축된 형식인`.tgz`파일로 추출해야 합니다. 예를  들면 다음과 같은 명령어로 추출가능합니다.
```sh
helm package . -f values.yaml
```
<br/>

이렇게 하면 다음과 같은 파일이 생성됩니다.
```
ls
...
-rw-r--r--@ 1 someuser  staff   2.2K 10월 23 16:43 dailyfeed-backend-chart-0.1.0.tgz
-rw-r--r--@ 1 someuser  staff   4.8K 10월 28 17:54 dailyfeed-backend-chart-1.0.0.tgz
-rw-r--r--@ 1 someuser  staff   9.7K 10월 31 11:23 dailyfeed-backend-chart-1.0.1.tgz
```
<br/>

`0.1.0.tgz` 와 같은 버전 명은 `Chart.yaml` 내의 `version` 속성에 정의해둔 값입니다.
e.g. **`dailfyeed-app-helm/base-chart/dailyfeed-backend-chart/Chart.yaml`**<br/>
```yaml
apiVersion: v2
name: dailyfeed-backend-chart
description: A Helm chart for Kubernetes
type: application
version: 1.0.3 ## version
```
<br/>

## batch-chart/dailyfeed-batch-chart
batch 의 경우 `Deployment`가 아닌 `Cronjob`으로 구성되기에 Helm Chart 의 구조가 `dailyfeed-backend-chart`와 많은 부분이 다릅니다. 따라서 batch 프로젝트의 경우 `batch-chart/dailyfeed-batch-chart` 내에 별도로 차트를 구성했습니다.

e.g. **`dailfyeed-app-helm/base-chart/dailyfeed-batch-chart/templates`**<br/>
templates 디렉터리로 이동해서 어떤 cronjob 들이 있는지 확인해보면 다음과 같습니다.
```sh
cd dailfyeed-app-helm/base-chart/dailyfeed-batch-chart/templates

ls -al
-rw-r--r--@ 1 someuser  staff   3.6K 11월 12 09:54 cronjob-jwt-key-rotation.yaml
-rw-------@ 1 someuser  staff   3.2K 11월 30 16:21 cronjob-kafka-topic-creator.yaml
-rw-r--r--@ 1 someuser  staff   3.8K 11월 26 16:45 cronjob-listener-dead-letter-restore.yaml
-rw-r--r--@ 1 someuser  staff   3.8K 11월 26 16:45 cronjob-publisher-dead-letter-restore.yaml
-rw-r--r--@ 1 someuser  staff   3.6K 11월 12 09:55 cronjob-token-cleanup.yaml
```
<br/>

위의 cronjob 들 중 제일 첫번째 파일인 `cronjob-jwt-key-rotation.yaml` 의 내용을 열어서 확인해보면 다음과 같습니다.<br/>
e.g. **`dailfyeed-app-helm/base-chart/dailyfeed-batch-chart/templates/cronjob-jwt-key-rotation.yaml`**<br/>
```yaml
{{- if .Values.cronJobs.jwtKeyRotation.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ .Values.appName }}-jwt-key-rotation
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.appName }}
    job-type: jwt-key-rotation
spec:
  # Cron 스케줄 (기본: 매일 새벽 2시)
  schedule: {{ .Values.cronJobs.jwtKeyRotation.schedule | quote }}

  # 동시 실행 정책
  concurrencyPolicy: {{ .Values.cronJobs.jwtKeyRotation.concurrencyPolicy }}

  # Job History 관리
  successfulJobsHistoryLimit: {{ .Values.cronJobs.jwtKeyRotation.successfulJobsHistoryLimit }}
  failedJobsHistoryLimit: {{ .Values.cronJobs.jwtKeyRotation.failedJobsHistoryLimit }}

  jobTemplate:
    spec:
      # Job 완료 후 Pod 유지 시간
      ttlSecondsAfterFinished: {{ .Values.cronJobs.jwtKeyRotation.ttlSecondsAfterFinished }}

      # 재시도 횟수
      backoffLimit: {{ .Values.cronJobs.jwtKeyRotation.backoffLimit }}

      template:
        metadata:
          labels:
            app: {{ .Values.appName }}
            job-type: jwt-key-rotation
        spec:
          restartPolicy: {{ .Values.cronJobs.jwtKeyRotation.restartPolicy }}

          containers:
          - name: {{ .Values.appName }}-jwt-key-rotation
            image: ghcr.io/alpha3002025/{{ .Values.appName }}-svc:{{ .Values.imageTag }}
            imagePullPolicy: {{ .Values.imagePullPolicy }}

            # 배치 Job 실행 명령
            args:
            - "--spring.profiles.active={{ .Values.profile }}"
            - "--spring.batch.job.name=jwtKeyRotationJob"
            - "--spring.task.scheduling.enabled=false"
            - "--spring.main.web-application-type=none"
            - "requestedAt=$(date +%Y-%m-%dT%H:%M:%S.%N)"

            env:
            - name: SPRING_PROFILES_ACTIVE
              value: {{ .Values.profile }}
            - name: MYSQL_JDBC_URL
              valueFrom:
                configMapKeyRef:
                  name: mysql-config
                  key: MYSQL_JDBC_URL
            - name: MYSQL_USERNAME
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: MYSQL_USERNAME
            - name: MYSQL_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: MYSQL_PASSWORD
            - name: MYSQL_SCHEMA
              valueFrom:
                configMapKeyRef:
                  name: mysql-config
                  key: MYSQL_SCHEMA
            - name: REDIS_HOST
              valueFrom:
                configMapKeyRef:
                  name: redis-config
                  key: REDIS_HOST
            - name: REDIS_PORT
              valueFrom:
                configMapKeyRef:
                  name: redis-config
                  key: REDIS_PORT
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: mongodb-secret
                  key: MONGODB_URI
            - name: KAFKA_BOOTSTRAP_SERVERS
              valueFrom:
                secretKeyRef:
                  name: kafka-secret
                  key: KAFKA_BOOTSTRAP_SERVERS
            {{- with .Values.cronJobs.jwtKeyRotation.envValues }}
            {{- toYaml . | nindent 12 }}
            {{- end }}

            resources:
              requests:
                memory: {{ .Values.cronJobs.jwtKeyRotation.resources.memory.requests }}
                cpu: {{ .Values.cronJobs.jwtKeyRotation.resources.cpu.requests }}
              limits:
                memory: {{ .Values.cronJobs.jwtKeyRotation.resources.memory.limits }}
                cpu: {{ .Values.cronJobs.jwtKeyRotation.resources.cpu.limits }}
{{- end }}
```
<br/>

`cronJobs.jwtKeyRotation.enabled` 를 보시면 values.yaml 내에 `cronJobs` 속성 아래에 `jwtKeyRotation` 필드 내의 `enabled` 필드의 값이 `true`일때에만 실행되도록 되어 있는 것을 보실 수 있습니다. `templates` 내에 정의해둔 cronjob 이 실행될 지를 enabled 에 true/false 를 지정하는 것에 따라 결정되도록 해두었습니다.<br/>

> helm 에 대해 모르는 분들이 있을 수 있어서 기본적인 내용을 언급해보면, helm install 시에는 설치하려는 해당 chart 내의 templates 디렉터리 내의 모든 yaml 을 클러스터에 적용되게 됩니다. <br/>

<br/>
values.yaml 의 내용은 다음과 같습니다.
e.g. **`dailfyeed-app-helm/base-chart/dailyfeed-batch-chart/values.yaml`**<br/>

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
resources:
  memory:
    requests: "500Mi"
    limits: "1Gi"
  cpu:
    requests: "500m"
    limits: "1000m"
probeValues:
  readiness:
    httpGetPath: /healthcheck/ready
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 3
  liveness:
    httpGetPath: /healthcheck/live
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 7
  startup:
    httpGetPath: /healthcheck/startup
    httpGetPort: 8080
    initialDelaySeconds: 30
    periodSeconds: 1
    successThreshold: 1
    failureThreshold: 3
persistence:
  enabled: false
  storageClass: local-path
  storageRequest: "1Gi"
  accessModes:
  - ReadWriteOnce
  mountPath: /image

# CronJob 설정 (Production 환경 기본값)
cronJobs:
  # JWT Key Rotation Job - Production: 매일 새벽 2시
  jwtKeyRotation:
    enabled: true
    # Cron 스케줄: 매일 새벽 2시에 실행
    schedule: "0 2 * * *"
    # 동시 실행 방지 (Forbid: 이전 작업이 완료될 때까지 새 작업 시작 안함)
    concurrencyPolicy: "Forbid"
    # Job History 유지 개수
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 3
    # Job 완료 후 Pod 유지 시간 (초)
    ttlSecondsAfterFinished: 3600
    # 재시도 횟수
    backoffLimit: 2
    # Pod 재시작 정책
    restartPolicy: "Never"
    # 환경변수 (필요시 추가)
    envValues: []
    # 리소스 설정
    resources:
      memory:
        requests: "256Mi"
        limits: "512Mi"
      cpu:
        requests: "200m"
        limits: "500m"

  # Token Cleanup Job
  tokenCleanup:
    enabled: true
    # Cron 스케줄: 매일 새벽 3시에 실행
    schedule: "0 3 * * *"
    # 동시 실행 방지
    concurrencyPolicy: "Forbid"
    # Job History 유지 개수
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 3
    # Job 완료 후 Pod 유지 시간 (초)
    ttlSecondsAfterFinished: 3600
    # 재시도 횟수
    backoffLimit: 2
    # Pod 재시작 정책
    restartPolicy: "Never"
    # 환경변수 (필요시 추가)
    envValues: []
    # 리소스 설정
    resources:
      memory:
        requests: "256Mi"
        limits: "512Mi"
      cpu:
        requests: "200m"
        limits: "500m"

  # Listener Dead Letter Restore Job - Kafka Listener Dead Letter 복구 배치
  listenerDeadletterRestore:
    enabled: true
    # Cron 스케줄: 1분마다 실행
    schedule: "*/1 * * * *"
    # 동시 실행 방지 (Forbid: 이전 작업이 완료될 때까지 새 작업 시작 안함)
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
    # 환경변수 (필요시 추가)
    envValues: []
    # 리소스 설정
    resources:
      memory:
        requests: "256Mi"
        limits: "512Mi"
      cpu:
        requests: "200m"
        limits: "500m"

  # Publisher Dead Letter Restore Job - Kafka Publisher Dead Letter 복구 배치
  publishDeadletterRestore:
    enabled: true
    # Cron 스케줄: 1분마다 실행
    schedule: "*/1 * * * *"
    # 동시 실행 방지 (Forbid: 이전 작업이 완료될 때까지 새 작업 시작 안함)
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
    # 환경변수 (필요시 추가)
    envValues: []
    # 리소스 설정
    resources:
      memory:
        requests: "256Mi"
        limits: "512Mi"
      cpu:
        requests: "200m"
        limits: "500m"

  # Kafka Topic Creator Job - 날짜 기반 토픽 사전 생성 (D+1)
  kafkaTopicCreator:
    enabled: true
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
<br/>


## 개별 서비스 chart
**`dailfyeed-app-helm`** 내에는  `member`, `content`, `timeline`, `search`, `activity`, `batch`, `content`, `frontend`, `image` 등 개별 서비스에 대한 chart 들이 있으며 이 개별 서비스 chart 디렉터리에서는 애플리케이션의 profile 이 `local`인지, `dev`인지에 따라 다르게 동작할수 있도록 `values-local.yaml`, `values-dev.yaml`파일들이 개별적으로 정의되어 있습니다. <br/>
<br/>

> hpa-configs 라는 디렉터리 역시 보이는데, HPA 설정에 대해서는 별도의 문서에서 따로 설명하도록 하겠습니다.<br/>

<br/>

e.g. **`dailfyeed-app-helm`**<br/>
```bash
cd dailfyeed-app-helm && ls -al
## 개별 서비스 차트
drwxr-xr-x@ 15 alpha300uk  staff   480B 11월 22 18:00 activity
drwxr-xr-x@  9 alpha300uk  staff   288B 11월 30 16:26 batch
drwxr-xr-x@ 13 alpha300uk  staff   416B 11월 22 18:00 content
drwxr-xr-x@ 10 alpha300uk  staff   320B 11월 22 18:00 frontend
drwxr-xr-x@ 15 alpha300uk  staff   480B 11월 22 18:00 image
drwxr-xr-x@ 15 alpha300uk  staff   480B 11월 22 18:00 member
drwxr-xr-x@ 14 alpha300uk  staff   448B 11월 22 18:00 search
drwxr-xr-x@ 13 alpha300uk  staff   416B 11월 22 18:00 timeline

## 공통 차트 템플릿 패키지
drwxr-xr-x@  7 alpha300uk  staff   224B 11월 22 15:39 base-chart

## hpa 설정 (뒤에서 설명)
drwxr-xr-x@ 11 alpha300uk  staff   352B 11월 10 14:10 hpa-configs

## istio 설정 (다른 문서에서 설명)
drwxr-xr-x@ 16 alpha300uk  staff   512B 10월 26 16:08 istio-configs

## 쉘스크립트
-rw-r--r--@  1 alpha300uk  staff   1.6K 11월 11 16:59 install-dev.sh
-rw-r--r--@  1 alpha300uk  staff   1.6K 11월 11 16:57 install-local.sh
-rw-r--r--@  1 alpha300uk  staff   892B 10월 12 11:39 uninstall-dev.sh
-rw-r--r--@  1 alpha300uk  staff   892B 10월 12 11:39 uninstall-local.sh

```


개별 서비스 차트들은 각각 `activity`, `batch`, `content`, `frontend`, `image`, `member`, `search`, `timeline`으로 존재합니다. 이번 문서에서는 `member`를 기준으로 개별 서비스 차트들에 대해 설명하겠습니다.<br/>

<br/>

개별 서비스인 member 의 helm 디렉터리로 이동해서 파일들을 확인해보면 다음과 같습니다.
```bash
➜  member git:(main) ls -al
total 200
drwxr-xr-x@ 13 alpha300uk  staff    416 12월  5 16:02 .
drwxr-xr-x@ 20 alpha300uk  staff    640 11월 11 16:59 ..
## (1)
-rw-r--r--@  1 alpha300uk  staff   1564 11월 10 14:10 values-dev-member.yaml
-rw-r--r--@  1 alpha300uk  staff   1732 11월 10 14:10 values-local-member.yaml
-rw-r--r--@  1 alpha300uk  staff   1153 11월 10 14:10 values.yaml

## (2)
-rw-r--r--@  1 alpha300uk  staff    868 11월 22 18:00 install-helm-dev.sh
-rwxr-xr-x@  1 alpha300uk  staff    877 11월 22 18:00 install-helm-local.sh
-rw-r--r--@  1 alpha300uk  staff     44 10월 12 11:39 uninstall-helm.sh

## (3)
-rw-r--r--@  1 alpha300uk  staff   4890 10월 23 17:29 dailyfeed-backend-chart-0.1.0.tgz
-rw-r--r--@  1 alpha300uk  staff   4909 10월 28 17:54 dailyfeed-backend-chart-1.0.0.tgz
-rw-r--r--@  1 alpha300uk  staff  20093 11월 22 15:04 dailyfeed-backend-chart-1.0.1.tgz
-rw-r--r--@  1 alpha300uk  staff  20095 11월 22 15:07 dailyfeed-backend-chart-1.0.2.tgz
-rw-r--r--@  1 alpha300uk  staff  20149 11월 22 15:39 dailyfeed-backend-chart-1.0.3.tgz
```

(1) values 파일들
- vaules-dev-member.yaml, values-local-member.yaml, values.yaml 은 local,dev 프로필에 따라 다르게 사용할 yaml 파일들입니다.

(2) install 스크립트
- install-helm-dev.sh, install-helm-local.sh : helm 명령어를 local, dev 프로필에 맞도록 values 파일을 선택해서 실행하고, istio 리소스 설치, hpa 적용 등을 수행합니다. 
- helm 명령어는 `helm install -n dailyfeed dailyfeed-member dailyfeed-backend-chart-1.0.3.tgz -f values-local-member.yaml` 와 같은 형식으로 수행됩니다. 

(3) 패키지(`.tgz`)파일들
- base-chart 디렉터리에서 만든 `tgz` 형식의 패키지들입니다. 새로운 변경사항이 생겨서 chart 의 버전이 올라가면 새롭게 패키징을 `tgz`파일로 패키징하며, 생성된 패키지 파일은 모두 개별 서비스 디렉터리 (`activity`, `batch`, `content`,`member`, `timeline`, `search`)들 각각에 복사해줍니다.
<br/>


### (1) values 파일들
e.g. `values-local-member.yaml`
```yaml
imageTag: cbt-20251103-1
appName: dailyfeed-member
replicas: 1
profile: dev
portNumber: 8080
envValues:
- name: SERVER_PORT
  value: "8080"
- name: MEMBER_SERVICE_URL
  value: http://dailyfeed-member-svc.dailyfeed.svc.cluster.local:8080
- name: SEARCH_SERVICE_URL
  value: http://dailyfeed-search-svc.dailyfeed.svc.cluster.local:8080
- name: CONTENT_SERVICE_URL
  value: http://dailyfeed-content-svc.dailyfeed.svc.cluster.local:8080
- name: ACTIVITY_SERVICE_URL
  value: http://dailyfeed-activity-svc.dailyfeed.svc.cluster.local:8080
- name: IMAGE_SERVICE_URL
  value: http://dailyfeed-image-svc.dailyfeed.svc.cluster.local:8080
configSecretItems:
- kafka
- redis
- mysql
- mongodb
resources:
  memory:
    requests: "650Mi"
    limits: "800Mi"
  cpu:
    requests: "500m"
    limits: "2000m"
probeValues:
  readiness:
    httpGetPath: /healthcheck/ready
    httpGetPort: 8080
    initialDelaySeconds: 5
    periodSeconds: 10
    successThreshold: 1
    failureThreshold: 3
  liveness:
    httpGetPath: /healthcheck/live
    httpGetPort: 8080
    initialDelaySeconds: 5
    periodSeconds: 15
    successThreshold: 1
    failureThreshold: 3
  startup:
    httpGetPath: /healthcheck/startup
    httpGetPort: 8080
    initialDelaySeconds: 10
    periodSeconds: 5
    successThreshold: 1
    failureThreshold: 80
#debugValues:
#- name: JAVA_TOOL_OPTIONS
#  value: "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"
persistence:
  enabled: false
  storageClass: local-path
  storageRequest: "1Gi"
  accessModes:
  - ReadWriteOnce
  mountPath: /data
```

`imageTag`
- 파일에는 `cbt-20251103-1` 로 지정되어 있는데, 2025/12/05 현재는 외부에서 `--set` 옵션을 통해 이미지의 버전을 주입합니다. 
- shell script 를 git 을 통해 관리하기 때문에 `--set`옵션으로 inline 명령을 내리는 것으로 인한 형상관리에 대한 문제는 없습니다.

`replicas`
- 기본적으로는 1기 씩 설치되도록 해두었습니다.
- 뒤에서 살펴볼 'hpa 설정'에서는 여러개의 replica 로 scale out 이 되도록 설정이 되어 있습니다.

`envValues`
- dev 프로필에서 사용할 환경변수이며, 대부분 서비스들의 접속 주소입니다.
- 각 서비스들은 http 프로토콜을 사용하지만, istio proxy container 에 의해 https 통신으로 각각의 서비스와 통신을 수행하게 됩니다.

<br/>
<br/>

### (2) install 스크립트
install 스크립트에서는 Istio VirtualService, DestiantionRule 을 설치하고, 애플리케이션을 helm 으로 설치하며, hpa 를 적용하는 과정을 거칩니다.
- Istio VirtualService,DestinationRule 설치
- helm install
- member 서비스 HPA 적용
<br/>

e.g. `install-helm-local.sh`
```sh
#!/bin/bash

# Usage: ./install-helm-local.sh <IMAGE_TAG>
# Example: ./install-helm-local.sh beta-20251023-1234

## (1) 파라미터 체크
if [ -z "$1" ]; then
  echo "Error: IMAGE_TAG is required"
  echo "Usage: $0 <IMAGE_TAG>"
  echo "Example: $0 beta-20251023-1234"
  return 1
fi

## (2) 이미지 태그 변수 세팅
IMAGE_TAG=$1


## (3) istio virtual service, desitination rule 설치
# Istio DestinationRule 및 VirtualService 적용
echo "📡 Applying Istio configurations for member service..."
kubectl apply -f ../istio-configs/destinationrule-member.yaml
kubectl apply -f ../istio-configs/virtualservice-member.yaml
echo ""

## (4) helm 패키지 설치
# Helm 설치
echo "📦 Installing member service..."
helm install -n dailyfeed dailyfeed-member \
  dailyfeed-backend-chart-1.0.3.tgz \
  -f values-local-member.yaml \
  --set imageTag=${IMAGE_TAG}


## (5) hpa 적용
# HPA 적용
echo "📈 Applying HPA for member service..."
kubectl apply -f ../hpa-configs/hpa-member.yaml

echo "✅ Member service installation completed"
```
<br/>

(1) 파라미터 체크
- `$1` 이 누락될 경우 에러를 냅니다.
- 첫번째 파라미터를 의미하는 `$1` 은 이미지 태그명입니다.

(2) 이미지 태그 변수 세팅
- 쉘 스크립트 내에서 사용할 변수, 변수의 값 입니다.
- 이미지의 태그 명을 의미합니다.

(3) istio virtual service, destination rule 설치
- member 서비스에 대한 Destination Rule, VirtualService 를 설치합니다.
- OutlierDetection, CircuitBreaker 등에 대한 설정이 있는데, 여기에 대해서는 이 문서의 하단의 `istio-configs`섹션에서 확인하실 수 있습니다.

(4) helm 패키지 설치
- 위에서 설명했듯, `base-chart` 내에 생성해둔  `*.tgz` 로 패키징된 패키지 파일을 기반으로 설치하며, imageTag 는 `--set` 옵션을 통해 주입합니다.
- 현재 파일은 `install-helm-local.sh` 파일로, local 프로필에 대해 실행되는 목적의 파일이기에 `values-local-member.yaml`을 values 파일로 선택해서 사용하고 있습니다.

(5) hpa 적용
- `../hpa-configs/hpa-member.yaml` 에는 hpa 에 관련된 내용이 적용되어 있는데 여기에 대해서는 이 문서 하단의 `hpa-configs` 섹션에서 확인하실 수 있습니다.

<br/>
<br/>

### (3) 패키지(`.tgz`) 파일들
개별 서비스 디렉터리에는 다음과 같이 패키지 파일들이 존재하며, 모두 helm 의 공통 템플릿역할을 하는 `base-chart`의 변경사항이 발생했을 때마다 버전이 올라가면서 생긴 개별파일들입니다.<br/>
```
dailyfeed-backend-chart-0.1.0.tgz
dailyfeed-backend-chart-1.0.0.tgz
dailyfeed-backend-chart-1.0.1.tgz
dailyfeed-backend-chart-1.0.2.tgz
dailyfeed-backend-chart-1.0.3.tgz
```
<br/>
<br/>

## istio-configs
`member`,`timeline`, `content`, `search`, `image`, `activity` 와 같은 개별 서비스들은 모두 VirtualService, DestinationRule 을 정의하고 있습니다. 위에서 살펴봤던 개별 서비스 chart 를 설치하는 쉘스크립트 파일인 `install-helm-local.sh`파일내에서는 다음과 같이 istio-configs 내의 VirtualService, DestinationRule 을 적용했었습니다.<br/>
<br/>

e.g. `dailyfeed-app-helm/member/install-helm-local.sh`<br/>
```sh
## ...

## (3) istio virtual service, desitination rule 설치
echo "📡 Applying Istio configurations for member service..."
kubectl apply -f ../istio-configs/destinationrule-member.yaml
kubectl apply -f ../istio-configs/virtualservice-member.yaml
echo ""

## ...
```
<br/>
<br/>

### VirtualService
VirtualService 에는 다음의 내용들을 정의해두었습니다.
- 라우팅 (Routing)
	- 현재 각 서비스에는 `v1` subset 으로 모든 트래픽을 라우팅하며, 포트는 8080 을 사용중입니다.
	- e.g. 장애 발생시 `hotfix-20251208` 과 같은 subset 을 별도로 지정해 라우팅 대상을 변경해서 대웅하는 것이 가능합니다.
- 트래픽 가중치 (Traffic Weight)
	- `v1` subset 으로 100 % 트래픽을 전송
	- e.g. 차기버전(v2)의 오류나 반응 여부를 canary 배포 방식으로 5%, 20% 30% 로 가중치를 두어 반응을 살펴볼 수 있습니다.
- 타임아웃 (Timeout): 
	- 전체 요청에 대해 `10s`(10초)의 타임아웃을 지정했습니다.
	- e.g. Destination Target 에서 응답을 안하거나 병목현상 발생, 재시동으로 인한 응답지연등이 발생될 경우 Timeout 을 적용하면, 전체 서비스로 장애가 전파되지 않습니다.
- 재시도 정책 (Retry Policy)
	- `attempts=5` : 요청 실패 시 최대 5번의 재시도를 수행
	- `perTryTimeout=3s` : 각 재시도 시도 마다 3초의 타임아웃이 적용
	- `retryOn=gateway-error,connect-failure,refused-stream,5xx,retriable-4xx,reset` : 게이트웨이 에러, 커넥션 실패, 5xx 서버에러, 4xx 서버 에러 발생시 재시도
	- `retryRemoteLocalities=true` : 서비스 요청이 실패해서 재시도(Retry)수행시에 요청을 보냈던 지역(Locality)이 아닌 다른지역(Remote)의 인스턴스로도 재시도를 보낼 수 있도록 허용하는 옵션

Retry Policy 내의 `retryRemoteLocalities` 속성은 특정 지역(Zone/Region) 전체에 장애가 발생하거나 불안정할 때, 다른 지역의 건강한 인스턴스를 활용해 서비스의 '가용성(Availability)'을 높이기 위해 사용되는 설정입니다. 다른 지역으로 넘어가기 때문에 네트워크 지연 시간(Latency)가 약간 늘어날 수 있고, 클라우드 환경에 따라 데이터 전송 비용이 발생할 가능성이 있습니다. 하지만 서비스 다운을 막기 위해서는 유용하게 사용되는 설정입니다.<br/>
<br/>

#### e.g. `retryRemoteLocalities` 시나리오
`dailyfeed-member` 서비스가 **한국(Seoul)** 리전의 두 가용 영역(Zone)에 분산되어 배포되어 있다고 가정해 보겠습니다.
- **Zone A (Local)**: 현재 사용자의 요청을 처리 중인 구역 (예: 서울-a)
- **Zone B (Remote)**: 물리적으로 떨어진 다른 구역 (예: 서울-b)

<br/>

일반적으로 Istio는 성능과 비용 최적화를 위해 **Locality Load Balancing(지역성 로드 밸런싱)** 기능을 사용하여, 가능하면 같은 Zone 내의 인스턴스로 트래픽을 보냅니다.<br/>

(기본설정) `retryRemoteLocalities: false` 
1. 사용자 요청이 들어오고, Istio가 **Zone A**에 있는 `dailyfeed-member`파드(Pod)로 요청을 보냅니다.
2. 그런데 **Zone A**의 파드가 일시적인 과부하나 오류로 인해 **500 에러**를 뱉어냅니다.
3. VirtualService에 설정된 대로 **재시도(Retry)**를 시도합니다.
4. 이때,  `false` 로 되어 있다면 Istio는 재시도 요청도 **여전히 같은 Zone A 내의 다른 파드**로만 보내려고 시도할 수 있습니다. (설정된 로드밸런싱 정책에 따라 다름)
5. 만약 **Zone A 전체가 장애 상황**이라면, 재시도를 해도 계속 실패하게 됩니다.

<br/>

(현재 프로젝트 설정) `retryRemoteLocalities: true`
1. 마찬가지로 요청이 **Zone A**로 갔다가 실패합니다.
2. 재시도가 트리거됩니다.
3. 이때 Istio는 "원격지(Remote Locality)로 재시도를 보내도 좋다"는 허락을 받았으므로, **Zone B**에 있는 건강한 dailyfeed-member 파드로 재시도 요청을 보냅니다.
4. **Zone B**의 파드가 정상적으로 응답하여 사용자는 에러 없이 서비스를 이용하게 됩니다.

<br/>
<br/>

### DestinationRule
DestinationRule 에는 다음의 내용들을 정의해두었습니다.
- 로드밸런서 (LoadBalancer) : `LEAST_REQUEST` 알고리즘을 이용해 요청이 가장 적은 인스턴스로 트래픽을 분산합니다.(`choiceCount:2`)
- 커넥션 풀 (Connection Pool) : 과도한 연결 또는 요청 폭주를 방지하기 위한 설정
	- TCP : 최대 연결 수 100개, 연결 타임아웃 3초, Keepalive 설정
	- HTTP : 대기요청 100개, HTTP2 최대 요청 500개, 연결당 최대 요청 10개, 재시도 3회, 유휴 타임아웃 3초지정
- 서킷브레이커 (OutlierDetaction) 서킷브레이커 역할을 수행하며 비정상적인 인스턴스를 일시적으로 제외시키는 역할
	- `5xx` 에러 5회 or Gateway 에러 3회 연속 발생시 발동
	- 감지 간격 : 1분
	- 기본 제외(Ejection) 시간 : 5분 (`baseEjectionTime`)
	- 최대 50% 의 인스턴스 까지 제외 가능 (`maxEjectionPercent`)
- 서브셋 (Subsets)
	- `v1` 이라는 이름의 서브셋으로 지정
	- 추후 다른 버전명으로 그룹화하고 라우팅을 별도로 할 경우 서브셋을 추가하면 됨

<br/>
<br/>

## hpa-configs
`member`,`timeline`, `content`, `search`, `image`, `activity` 와 같은 개별 서비스들은 모두 HPA 를 적용하고 있습니다. 위에서 살펴봤던 개별 서비스 chart 를 설치하는 쉘스크립트 파일인 `install-helm-local.sh`파일내에서는 다음과 같이 hpa-configs 디렉터리 내의 `hpa-{서비스명}.yaml` 을 적용했었습니다.<br/>
<br/>

e.g. `dailyfeed-app-helm/member/install-helm-local.sh`<br/>
```bash
### ...
## (5) hpa 적용
echo "📈 Applying HPA for member service..."
kubectl apply -f ../hpa-configs/hpa-member.yaml

echo "✅ Member service installation completed"
```
<br/>

hpa 설정은 `image`, `search`, `frontend`를 제외한 `member`,`timeline`, `content`, `activity`  각각에 대해 거의 동일하게 설정되었습니다.


1\. 대상 리소스 (Target)<br/>
deployment 로 정의해둔 **dailyfeed-member** 에 대해 적용됩니다.<br/>
<br/>

2\. 스케일링 범위 (Replicas)<br/>
- **최소 파드 수**: **2개** (서비스 안정성을 위해 최소 2개 유지)
- **최대 파드 수**: **12개** (트래픽 폭주시 최대 12개까지 확장)

<br/>

프로젝트 끝난 후 다시 돌아보니 조금 과도하게 설정한 느낌이 있기는 합니다. 아마도 다시 프로젝트를 한다면 6개까지로 조정을 하고 노드 레벨에서의 로드밸런싱인 `karpenter` 등을 도입할지 등을 고려할 것 같습니다.<br/>
<br/>

3\. 스케일링 기준 (Metrics)<br/>
다음 두 가지 리소스 사용률이 목표치를 초과하면 스케일 아웃(파드 추가)이 발생합니다.
- **CPU**: 평균 사용률 **80%** 유지 목표
- **Memory**: 평균 사용률 **80%** 유지 목표

<br/>

4\. 스케일링 동작 방식 (Behavior)<br/>
파드 수가 너무 급격하게 변하는 것을 방지하기 위한 세부 정책입니다.<br/>

**스케일 다운 (Scale Down - 축소)**
- **안정화 시간**: 부하가 줄어도 **300초(5분)** 동안 상태를 지켜본 뒤 축소를 결정합니다 (플래핑 방지).
- **정책**: 1분마다 현재 파드의 **50%** 또는 **2개** 중 **더 적은 수**만큼만 천천히 줄입니다 (SelectPolicy: Min). 급격한 축소로 인한 위험을 방지합니다.

**스케일 업 (Scale Up - 확장)**
- **안정화 시간**: 부하 감지 후 **60초(1분)** 데이터로 판단합니다.
- **정책**: 1분마다 현재 파드의 **50%** 또는 **2개** 중 **더 많은 수**만큼 빠르게 늘립니다 (SelectPolicy: Max). 트래픽 급증에 빠르게 대응하기 위한 설정입니다.

<br/>
<br/>

### 참고) 플래핑(Flapping)
플래핑(Flapping)은 오토스케일링 시스템에서 **파드(Pod)의 개수가 짧은 시간 동안 불필요하게 늘어났다 줄어들기를 반복하는 현상**을 의미하는 용어입니다. "새가 날개를 퍼덕거리는(Flapping) 모습"을 빗대어 표현하는 용어입니다.<br/>

e.g. HPA가 CPU 사용률 50%를 유지하도록 설정되어 있을 경우
- **10:00:00** - CPU 사용률이 **51%** 도달 ➝ HPA가 파드를 늘린다.(Scale Out)
- **10:00:10** - 파드가 늘어난 후 CPU 사용률이 **49%** 로 하락 ➝ HPA가 파드를 줄인다. (Scale In)
- **10:00:20** - 파드가 줄어드니 다시 CPU가 **51%** 로 상승 ➝ HPA가 파드를 다시 늘린다. (Scale Out)

<br/>

이렇게 임계값(Threshold) 근처에서 수치가 미세하게 오르락내리락할 때, 시스템이 너무 민감하게 반응하면 파드가 계속 생성되고 삭제되는 악순환이 생깁니다. 이렇게 되면 서비스가 불안정해지고, 파드를 다시 띄우거나 이미지를 Pull 하거나, 파드를 종료시키면서 자원낭비가 발생하게 됩니다. 이런 현상을 방지하려면 "해당 시간 동안은 안정화되는지 지켜보겠다"는 의미로 **stabilizationWindowSeconds: 300** 와 같은 안정화 윈도우 시간을 적용해서 해당 시간 동안 유예기간을 둡니다.<br/>
<br/>

