# publish-type 으로 kafka,feign 통신방식 선택

[kafka 사용 케이스 소개](introduce.md) 에서는`dailyfeed-content-svc` 에서 `dailyfeed-activity-svc` 에서 멤버 활동을 기록할 때 kafka 를 어떻게 사용하는지 살펴봤습니다. 

![](./img/publish-type/20251230-16-12-20-1.png)

<br/>

[kafka 사용 케이스 소개](introduce.md) 에서 정리했었지만, 통신 절차를 요약해보면 다음과 같습니다.<br/>
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


## kafka 대신 feign 을 사용해야 할 경우 에는?
kafka 기반의 시스템을 운영 중에, kafka 의 증설이나 유지보수를 수행해야 하는 케이스가 발생할 수 있습니다. 이런 경우에 대해 예비 통신 방법이 필요한데, `dailfyeed` 프로젝트에서는 '예비 통신 방식'으로 `feign` 을 선택했습니다. `application-{프로필}.yaml` 내에 정의 해둔 `dailyfeed.services.content.publish-type.post-service`속성에 `KAKFA`또는 `FEIGN` 을 명시해서 애플리케이션 구동 시 kafka 기반의 통신을 할지, feign 기반으로 통신을 할지가 정해질수 있도록 yaml 을 구성해두었습니다. 만약, kafka 를 사용 불가능하다거나, kafka 유지보수가 예정되어 있어서 feign 기반으로 애플리케이션을 전환해야 할 경우 해당 속성을 `FEIGN` 으로 바꾼 후 새로운 버전의 image 를 빌드/배포 후 kubernetes 클러스터 내에 Rolling Update 방식으로 배포하면 됩니다.<br/>
<br/>

e.g. 글 작성<br/>
feign 을 이용해 '글 작성'기능을 예로 들어보면 다음과 같이 API 통신이 이뤄집니다.

![](./img/publish-type/20251230-16-12-52-1.png)

<br/>

feign 을 통해 HTTP API 요청을 수행할 경우 동기적인 통신을 수행하도록 구현해두었습니다. feign 을 통해 HTTP API 통신을 할때 비동기적으로 구성하는 것 역시 가능하지만, 이번 프로젝트에서는 구현의 단순함과 문서화가 가능하도록 하기 위해 동기적인 통신 방식으로 단순하게 구현해두었습니다.<br/>

그렇다면 프로젝트 내에서 kafka 를 사용할지, feign 을 사용할지 어떻게 선택하도록 해두었을까요? `dailyfeed` 프로젝트 에서는 다음 속성을 통해 `kafka` 로 서비스간 통신을 할지, `feign` 을 통해 서비스 간 통신을 할지 선택하는 것이 가능하도록 구성해두었습니다.
- `dailyfeed.services.content.publish-type.post-service` (참고 : dailfyeed-content-svc/PostService.java)
- `dailyfeed.services.content.publish-type.comment-service` (참고 : dailfyeed-content-svc/CommentService.java)
<br/>

예를 들어 PostService.java 에서 위의 속성을 사용하는 코드 중 일부는 다음과 같습니다.<br/>
```java
  
@Slf4j  
@RequiredArgsConstructor  
@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)  
@Service  
public class PostService {
	// ...

	// (1)
	@Value("${dailyfeed.services.content.publish-type.post-service}")  
	private String publishType;
	
	// ...
	
	
	// 게시글 작성  
	public PostDto.Post createPost(MemberProfileDto.Summary author, PostDto.CreatePostRequest request, String token, HttpServletResponse response) {  
	  
	    // 작성자 정보 확인  
	    Long authorId = author.getId();  
	  
	    // 본문 저장 (제목 기능을 그대로 둘지 아직 결정을 못해서 일단은 첫 문장만 떼어두기로 (요약 등..))  
	    Post post = Post.newPost("", request.getContent(), authorId);  
	    Post savedPost = postRepository.save(post);  
	  
	    // mongodb 에 본문 내용 저장  
	    insertNewDocument(savedPost);  
		
		// (2)
	    if (PublishType.KAFKA.getCode().equals(publishType)) { /// kafka 를 사용할 경우 (케이스 A)  
	        kafkaPublishPostEvent(savedPost, MemberActivityType.POST_CREATE);  
	    }  
	    else{ /// feign 을 사용할 경우 (케이스 B)  
	        feignPublishPostEvent(savedPost, MemberActivityType.POST_CREATE, token, response);  
	    }  
	    // return  
	    return postMapper.fromCreatedPost(savedPost, author);  
	}
}
```

(1) `@Value("${dailyfeed.services.content.publish-type.post-service}")`
- `application-{profile}.yaml` 에 정의해둔 속성을 읽어들입니다. 
- `application-{profile}.yaml` 의 내용은 대해서는 뒤에서 정리합니다.

(2) `if (PublishType.KAFKA.getCode().equals(publishType)) {...} else {...}`
- 만약 현재 배포된 애플리케이션 내의 `publish-type`값이  `KAFKA` 모드일 경우 카프카를 통해 메시지를 publish 합니다.
- 또는 현재 배포된 애플리케이션 내의 `publish-type`값이  `FEIGN` 모드일 경우 카프카를 통해 메시지를 publish 합니다.

<br/>

참고) `application-local.yaml`
```yaml
dailyfeed:  
  ## ...
  services:  
    member:  
      ## ...
    timeline:  
      ## ...
    content:  
      publish-type:  
        # KAFKA|FEIGN  
        post-service: KAFKA  
        comment-service: KAFKA
```
- post-service 의 경우 `KAFKA`를 사용하고, comment-service 의 경우에도 `KAFKA`를 사용하겠다고 명시해둔 상태입니다.

<br/>

## HTTP API 통신 역시 비동기 방식의 통신으로 구성 가능
이번 프로젝트에서는 feign 을 통한 통신을 단순하게 동기적으로 동작하도록 구성했습니다.<br/>

![](./img/publish-type/20251230-16-12-52-1.png)
<br/>

content-svc 에서 글 작성 트랜잭션을 수행 시 가장 마지막으로 멤버의 활동 기록을 저장할 때 `MemberActivityFeignHelper` 를 통해 `POST /api/posts` 요청을 보냅니다.<br/>
<br/>


그런데 feign 을 통해 HTTP API 통신을 하면 동기적인 통신만 가능하지만, 약간의 구조를 만든다면, feign을 통해 HTTP API 역시도 비동기적으로 구성하는 것이 가능합니다.<br/>

![](./img/publish-type/20251230-16-12-22-1.png)


<br/>

(1) `dailyfeed-frontend-svc` ➝ `dailfyeed-content-svc`
- frontend 에서 `dailyfeed-content-svc` 로 글 작성 요청을 `POST /api/posts`를 통해 수행합니다.

(2) `dailyfeed-content-svc` ➝ `dailyfeed-activity-svc`
- `dailyfeed-content-svc` 에서는 `POST /api/member-activities/schedule/posts` API 를 통해 글 작성 활동 기록 저장 작업의 예약을 요청합니다.
- 작업 예약 요청이 database 에 저장되면, `dailyfeed-activity-svc` 에서는 200 OK 를 응답합니다.
- 작업 예약 요청이 실패하면 트랜잭션을 실패시킵니다.
- 작업 예약 요청이 성공해서 200 OK 를 응답받으면, 멤버활동기록의 저장 여부와 상관 없이 `dailyfeed-frontend-svc`로 저장된 글을 return 합니다.

(3) `dailyfeed-batch-svc` ➝ database
- `dailyfeed-batch-svc` 에서는 1분에 한번씩 `member_activities_schedule` 테이블에 저장된 예약된 작업들을 읽어들여서 멤버활동 기록 객체로 변환 후 `member_activities` 테이블에 저장합니다.
- 배치를 통해 일괄 저장을 하는 구조로 수행됩니다.

