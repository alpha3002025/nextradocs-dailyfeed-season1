# kafka 사용 케이스 소개

현재 개발한 `dailyfeed-content-svc` 프로젝트에서 `글 쓰기/수정` 기능이 점점 운영 년수가 오래 되면서 중요한 사업 아이템이 되었다고 해보겠습니다. 피드에 글을 작성/수정하는 순간에 다음의 작업들을 수행해야 할 정도로 커졌을 경우 예를 들면 다음과 같은 기능들이 필요해질 수 있습니다.
- 블랙리스트 체크
- 욕설 체크
- 음란물 필터링
- 광고 추천 시스템 업데이트
<br/>

이 경우 `글 쓰기/수정` 기능의 인스턴스를 스케일아웃 가능한 애플리케이션으로 구성하고, 블랙리스트 체크, 욕설체크, 음란물 필터링, 광고 추천 시스템 업데이트 등을 feign 을 통해 수행할 수 도 있습니다. 하지만, 이번 문서 리포지터리 내의 `/tmi-docs/kafka` 내의 문서들에서는 위의 작업들을 `kafka` 를 통해 해결하는 과정에 대한 예제를 설명합니다.<br/>

위의 경우 처리 절차에 대해 정리해보면 다음과 같습니다. 

`dailyfeed-frontend-svc`
- (1) 글 작성/수정 요청

`dailyfeed-content-svc`
- (1) 블랙리스트 체크 API 요청
- (2) 음란물 필터링 API 요청
- (3) 광고 추천 시스템 업데이트 API 요청
- **(4) 멤버 활동 기록 저장**
<br/>

이와 같은 케이스에 대해 이번 프로젝트에서는 (1),(2),(3) 을 모두 구현하는 것은 불가능하기 때문에, `(4) 멤버 활동 기록 저장` 을 수행해야 하는 상황 만을 가정합니다.<br/>
<br/>

# kafka 도입
글 작성/수정/삭제 요청에 대한 멤버활동 기록은 비동기적으로 처리하기로 결정하는 상황을 가정해보겠습니다. 비동기적으로 멤버 활동을 기록하는 방법은 배치를 사용할수도 있지만, [Readme](./Readme.md) 에서도 언급했듯이 kafka 에 대한 사전지식을 보증하기 위해 'dailyfeed' 프로젝트에서는 kafka 를 도입했습니다. 처리를 하는 과정을 대략적으로 표현한 그림은 다음과 같습니다.<br/>

**'글 작성' 시 멤버 활동 기록 저장 시나리오**<br/>
![](./img/introduce/20251230-16-12-02-1.png)

<br/>

`dailyfeed-frontend-svc` → `dailyfeed-content-svc`
- 사용자가 글 작성 요청한 것에 대해 `dailyfeed-content-svc` 로 `POST /api/posts` 요청을 수행합니다.
<br/>

(kafka publish) `dailyfeed-content-svc` → `kafka`
- 글 작성 후 저장을 수행합니다.
- 저장한 글에 대해 kafka topic 으로 `POST_CREATED` 이벤트메시지를 발행합니다. 
- 메시지의 키와 Payload 는 뒤에서 다른 문서에서 자세히 정리합니다.
- 만약 kafka 로 메시지 발송이 실패할 경우 deadletter 에 저장을 수행합니다.
- 만약 kafka 로 메시지 발송이 실패했을 때 deadletter 에 저장하는 작업도 실패할 경우에는 Exception 을 throw 해서 트랜잭션을 실패시킵니다.
- frontend 로는 `5xx` 에러가 발송되고 frontend 는 재시도를 수행하게 됩니다.
<br/>

(kafka listen) `kafka` → `dailyfeed-activity-svc` 
- `@KafkaListener` 를 통해 메시지를 리슨하고 있다가 `POST_CREATED` 이벤트에 대한 키와 Payload 가 담긴 메시지를 수신했습니다.
- `POST_CREATED` 이벤트에 대한 키와 Payload 내의 Payload 를 읽어들여서 `member_activities` 컬렉션에 멤버활동 기록 데이터로 변환해서 저장합니다.
- `POST_CREATED` 이벤트에 대한 메시지 키를 통해 중복 수신했는지를 체크해서 중복되었을 경우 저장을 하지 않으며, 저장 순간에도 중복될 경우 역시 고려해서 `upsert` 를 수행합니다.

<br/>


> [Readme](./Readme.md) 에서 설명했듯, MSA 통신에 `kafka`를 도입한다는 것은 안티패턴이지만, kafka 에 대해 어떤 개념들을 이해하고 있고 어떤 맹점들을 이해하고 있는지 카프카의 설정에 대해 어느정도 알고 있는지를 보증하기 위해 `kafka` 를 도입했습니다.<br/>

<br/>



# 멤버 활동 기록 저장
`dailyfeed-activity-svc` 는 내가 팔로우하고 있는 멤버가 글/댓글/답글을 작성 했는지, 특정 글에 대한 좋아요,좋아요 취소 기록 등을 리스트로 확인할수 있도록 멤버 활동 기록 조회 API 를 제공하고 있습니다. 그리고 `dailyfeed-frontend-svc` 에서는 이 API 를 통해 특정 멤버들의 활동 기록들을 `알림 배너` 라는 기능을 개발하기 위해 백엔드 측인 `dailyfeed-activity-svc` 의 API 기능이 완료되기를 기다리고 있는 상황이라고 가정하겠습니다.<br/>
<br/>

`dailyfeed-activity-svc`
- (1) 멤버 활동 기록 조회 API, 활동기록 등록 API 



# 요약
여기에 대해 정리된 요구사항은 다음과 같습니다.<br/>

`dailyfeed-content-svc`
- 글/댓글 작성/수정 작업, 좋아요/좋아요 취소 시 멤버 활동 기록 저장

`dailyfeed-activity-svc`
- 내가 팔로우 중인 멤버들의 글/댓글 작성/수정 작업, 좋아요/좋아죠 취소 시 멤버활동 기록 저장
<br/>

그리고 이번 프로젝트에서 개발할 내용은 `dailyfeed-activity-svc` 에서 `멤버 활동 기록` 을 조회하는 API 에 대해, 여기에 필요한 `멤버 활동 기록` 데이터를 저장하는 기능을 구현합니다.<br/>
<br/>
