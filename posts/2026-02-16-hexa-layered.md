---
layout: post
toc: true
title: "헥사고날 아키텍처를 나는 왜 적용했는가?"
categories: architectures
tags: [ architecture ]
author:
  - 이현동
---

## 헥사고날 아키텍처까지 필요했을까?

**아래 예시 코드는 모두 실제 작성된 코드가 아닌 집에서 혼자 도메인을 대략적으로 설계하고 작성한 코드이며, 하나의 상황을 예시로 보여주는 코드입니다.**

**"도메인 모델이 명확한 서비스"**
위 한 문장으로 헥사고날의 도입을 목표해볼 수 있을까요?

헥사고날 아키텍처의 본질적 가치는 다음과 같습니다.

1. 도메인 로직의 순수성 보호이다.

만약 서비스가 외부 API를 호출하고 결과를 그대로 전달하는 pass-through 성격이라면 controller -> service -> port -> adapter(실제 로직) 이런 구조가 되어버리고 이건
의미없는 레이어 낭비인것은 분명합니다.
예를 들어 결제 시스템을 보면 PG사, 은행, 포인트 시스템 등 외부 연동이 많지만, 그 데이터를 조합하고 비즈니스 규칙을 적용하는 도메인 로직이 풍부할 수 있다. 이런 경우엔 외부 의존성이 많아도 헥사고날이 여전히
유효하게 적용될 수 있다고 생각합니다.
1번에 대한 주요 쟁점은 결과적으로 Domain 모듈의 imprt 문에 jpa나 외부 의존성을 띄지 않아야 한다. 이게 보호의 가시적 증거입니다.

광고를 예를 들었을때 도메인 로직이 많은 부분이 붙게 된다. 하나의 예시로 **타겟광고, 예산 유효성체크, 빈도제어, 스코어링** 등 순수 도메인 로직에 많은 adapter를 붙이게 된다. 이러한 경우에는
헥사고날로써
각각의 비즈니스 로직을 쪼개 usecase에서 port를 조립하여 사용한다면 재사용이 가능하다. 재사용이 어떻게 가능한가? port는 조립하여 사용하는것이 이와 같은 케이스이다. 이 하지만 이 조각을 너무 많이 쪼갤
경우에는 보일러 플레이트가 증가하기 때문에 개인적인 생각으로는 관심사-도메인(기능) 별로 묶거나 infra에서 기능 단위로 쪼개는게 좋다고 생각했습니다.

뿐만 아니라 service, usecase를 작성하기 위해서는 사실상 infra layer 개발이 마무리가 되어합니다. 하지만 시기상 모든 infra가 개발되어 있는 상태도 아니고 **business와
presentation 1인, infra 부분 1인** 이렇게 나눠서 작업을 하기에는 계층형 구조에는 한계가 있습니다. controller -> service -> mapper 순으로 작업이 마무리가 되어야
하기때문에 지정된 작업자 1명 만이 개발이 가능한겁니다. 이러한 부분은 **추상화**를 통해서 문제를 해결할 수 있다고 생각하실수도 있습니다.
하지만 앞서 언급했던 내용처럼 광고의 경우에는 그때 당시에 management와 serving이라는 도메인으로 두가지가 분리가 되어야만 햇고, servingAd와 Ad의 도메인간에 어느정도 격리가 필요성을
느꼈습니다.

실제 개발을 진행하며 TPS 변경에 따른 serving 전략이 수시로 바뀌었고, 계층형 구조일때의 경우 아래와 같이 비즈니스 로직이 지속적으로 변경될거 같습니다. 광고 도메인인의 경우는 실제로 사용자가 소비하는
매체로
광고 송툴이 멈춘다면 비용적인 측면에서도 큰 타격이 있습니다. 이를 위해 저는 안정적으로 설계하고 송출해야 한다고 생각을 했고, 이 판단에 대하여 동료와 신중하게 논의를 했던거 같습니다. 이렇게 요구사항이 빠르게
변한다면 개발을 하는것이 문제가 아닌 안정성의 측면에서 좀 더 고민을 했던거 같습니다.

만약 아래와 같은 계층형 코드라면,, 우리는 감히 어떻게 추가 개발한 기능만을 두고 테스트를 할 수 있을까요?

```java
// 1) AdServingService에 LocalCache를 먼저 조회하고 읽어어고 miss가 나면 이후에 아래 그대로 코드가 동작해야하는 상황을 가정해보겠습니다. 
@Service
class AdServingService {
    // redis에 직접 의존 -> local cache로 변경할때 문제가 발생할 수 있다.
    private final RedisTemplate<String, ServableAd> redisTemplate;

    // JPA 직접 의존
    private final ServableAdRepository servableAdRepository;

    public ServableAd getServableAd(Long adId) {
        String key = "servable-ad:" + adId;

        // 캐시 로직이 서비스에 직접 존재
        ServableAd cached = redisTemplate.opsForValue().get(key);
        if (cached != null) {
            return cached;
        }

        // DB 조회
        ServableAdEntity entity = servableAdRepository.findById(adId)
                .orElseThrow(() -> new AdNotFoundException(adId));

        ServableAd ad = toServableAd(entity);

        // 캐시 저장
        redisTemplate.opsForValue().set(key, ad, Duration.ofMinutes(30));

        return ad;
    }
}

```

요구 사항은 아래와 같은 흐름으로 변경했다고 가정하겠습니다.

1. persistence에서 직접 조회
2. local cache -> redis -> persistence 순서대로 조회
3. redis -> persistence 조회

그렇다면 service 코드 내부를 수정하여 처리하는 방법 뿐입니다. 근데 infraStructure와 같은 내용이 비즈니스 로직이라고 할수 있을까요,, 이부분에도 고민이 많았으나, 결국 스타일 차이라는 생각이 들었습니다.




2. 인프라 교체의 용이성

광고 트래킹의 경우 이러한 이유에서 헥사고날이 빛을 볼 수 있다고 생각했다. 트래킹의 경우 사실 pass-through의 성향이 매우 강하다.. 따라서 이를 도메인의 순수성을 지키는 측면보다는 infra
adapter를 교체하기 용이함과 동시에 테스트코드를 작성할때 실제로 adapter layer를 단위 테스트 시에 이러한 부분이 효과적인 부분이 있었다. 실제 sqsPort를 stubbing을 통해
messageSendAdapter의 인프라 없이 테스트가 가능했다.
인프라가 교체될 시점에 어떻게 코드의 구현이 바뀌게 될지에 대해 예시로 살펴보자.

### 헥사고날이 아니어도 인프라는 쉽게 교체가 가능하지 않을까?

그래서 헥사고날을 도입한 뒤에 고민을 해보았다. 이거 헥사고날이 아니었어도 괜찮을수도 있었겠다. 기존 계층형에서 DIP를 잘 적용하여 동일한 효과를 어떻게 낼 수 있을까? 예시 코드로 살펴볼까요.


위처럼 헥사고날은 usecase(sevice) 로직에 나중에 추가할 내용은 타게팅, budget등이 되고 결국 infra에 대한 모든 의존성은 빠진 형태로 비즈니스 로직을 보호할 수 있는 것입니다.

최근 헥사고날을 사용하며 장점 위주로 내용이 정리된 감이 있지만, 헥사고날은 정말 잘 이해하고 사용해야하며 러닝커브가 높은 만큼 비즈니스 로직이 정말 복잡해질때 빛을 발하는 아키텍처입니다. 저는 이러한 트레이드 오프를 인지 하여 헥사고날 구조의 일부를 뽑아 아래와 같은 결론에 도달한거 같습니다. 솔직하게 말씀드리면 이미 정해진 API(controller)는 변할일이 거의 없습니다. Controller에서 의존하는 Service도 비즈니스가 정해지면 거의 바뀔일이 없습니다. 때문에 추상화를 진행하는 것은 우리 비즈니스 밖(관심사 밖인) 인프라만 진행하는게 나을거 같다고 판단했습니다.

개발의 단위를 기능으로 모두가 잘 고민한다면 계층형 구조로도 테스트와 유지보수에 용이한 구조를 가져갈 수 있습니다. 앞서 소개한 강의 중 가장 와닿았던 말이 있는데요. (토비의 스프링에도 나오는 말입니다.)

지금 테스트를 도입하기 어렵다면 그건 좋은 코드라고 말하기 어렵다.

무조건적으로 맞는 말이 아니긴 하지만 어떤 의미인지 잘 생각해보면 유지보수 하는데 큰 도움이 될거라고 생각합니다. 




헥사고날을 적용하여 좋은점만 언급했지만, 단점에 대해 간략하게 적어보겠습니다. 

1. 많은 클래스파일, interface등으로 보일러플레이트 증가
2. 러닝커브가 높다
3. 복잡하지 않은 비즈니스로직에는 적합하지 않다. (ex. pass-through)


광고의 경우에는 앞서 언급한 이유에서 도입이 좋다고 판단했지만, 사실 제가 궁극적으로 하고 싶은말은 "추상화, 도메인 객체를 잘 이용하자" 입니다. 헥사고날의 경우 구조를 강제하는 방식으로 archUnit을 함께 사용할 경우 애플리케이션 아키텍처가 유지되는지 확인할 수 있습니다. 위 구조를 강제하여 개발자들이 강제적으로 추상화를 하며 개발하게 만드는 구조입니다. 반면 계층형 구조는 자유도가 높습니다. 개발하면서 끊임없이 고민하고 좋은 컨벤션을 함께 유지한다면, 유지보수하기 좋은 소프트웨어가 만들어질 수 있다고 생각합니다.


```java

@RequiredArgsConstructor
@RestController
public class ServableAdController {

    private final ServableAdService servableAdService;

    @PostMapping("/api/v1/serve/ad")
    public ResponseEntity<List<ServableAd>> serveAd(@RequestBody ServableAdsRequest request) {
        return ResponseEntity.ok(servableAdService.getServableAds(request));

    }
}


@Service
@RequiredArgsConstructor
public class ServableAdService {
    // redis에 직접 의존 -> local cache로 변경할때 문제가 발생할 수 있다.  
    private final RedisTemplate<String, ServableAd> redisTemplate;

    // JPA 직접 의존 x DIP를 통해 Impl을 주입받아 Service와 동일한 레벨에서 servableAdJpaRepository에 접근한다.  
    private final ServableAdRepository servableAdRepository;

    public List<ServableAd> getServableAds(ServableAdsRequest request) {
        String key = "servable-ad";

        // local cache 조회 - Caffeine  
        // 캐시 로직이 서비스에 직접 존재  
        List<ServableAd> cached = redisTemplate.opsForSet().pop(key, request.size());
        if (cached != null) {
            return cached;
        }
        // DB 조회  
        List<ServableAd> servableAds = servableAdRepository.findAll()
                .stream()
                .map(ServableAd::of)
                .toList();

        // 캐시 저장 - 하나의 예시일뿐  
        redisTemplate.opsForSet().add(key, servableAds.toArray(new ServableAd[0]));

        return servableAds;
    }
}

public interface ServableAdRepository {

    List<ServableAdEntity> findAll();
}

@RequiredArgsConstructor
@Repository
public class ServableAdRepositoryImpl implements ServableAdRepository {

    private final ServableAdJpaRepository repository;

    @Override
    public List<ServableAdEntity> findAll() {
        return repository.findAll();
    }
}

public interface ServableAdJpaRepository extends JpaRepository<ServableAdEntity, Long> {
}
```

위 계층을 대략 도식으로 그려보면 아래와 같습니다.

```
Controller
    |
Service   <-  Repository
                  |
            RepositoryImpl <- JpaRepository  
```
이는 결국 DIP를 통해 Repository를 추상화하고 구현체에서 JPA 기술에 의존하게 한것입니다. 이 부분을 잘 살펴보면 결국 Hexagonal에서 보여주는 구조와 비슷하다는 생각이 들었는데요. 저 또한 이러한 부분이 너무 혼동이 되었고, 다만 차이점이라고 하면
service 계층도 추상화를 통해 controller 계층에서 약하게 결합하는 점만이 다르다는 생각이 들었습니다. 과도하게 service 계층까지 추상화 하는 것이 좋은 방법일까? 라는 고민이 들기도 했지만, 만약 usecase로 service 계층을 (작성중)



|           | 계층형 + DIP           | 헥사고날                   |
|-----------|---------------------|------------------------|
| 의존성 역전    | 개발자가 "의도적으로" 적용해야 함 | 구조가 "강제"함              |
| 경계        | 암묵적 (컨벤션 의존)        | 명시적 (Port/Adapter)     |
| 신규 인원 온보딩 | "여기선 이렇게 해요" 설명 필요  | 폴더 구조만 봐도 어디에 뭘 넣을지 명확 |

이 글은 결코 헥사고날이 답이다. 아니면 계층형 구조가 답이다. 이러한 결론을 내리는 글은 아닙니다. 완벽한 방법과 정답은 없으며 각 프로젝트의 상황(리소스), 설계에 맞는 올바른 선택을 하시기를 바랍니다. 아무래도 생각을 정리하는 글이다보니 다소 단점에 포커스를 맞춰 작성했습니다.




기존 구조는 문제가 있는 구조는 절대 아닙니다.

다만 애플리케이션 아키텍처 상으로 infra가 강하게 결합하고 있는 구조가 유지보수 하기 어려운 상황으로 우리를 이끌고 infra 기술이나 추상화(디자인패턴 적용 등) 시에 어느 위치에 class 파일을 위치 시킬지 판단하기 어려웠습니다.




리소스(사람, 시간), 조금 더 유연한 확장 구조로 유도하기 위해 많은 고민을 하면서 제가 느꼈던 그리고 배웠던 내용에 대해 공유해보려고 합니다. 최근 신규로 개발하게 될 회원/인증 서버를 분석 및 설계하면서 애플리케이션 아키텍처 + 프로젝트 컨벤션 대해 많은 고민을 했습니다.

저는 정해지지 않은 것에 대한 해결책을 얻기 위해 많은 시간을 투입한거 같습니다. 그 과정에서 내린 대략적인 결론은 아래와 같습니다.




기술 스택은 선택사항일 뿐이다 (특히, 인프라는 자주 바뀌지 않지만 변경에 예민하지 않은 아키텍처를 선택하고 설계해야한다)
계층형, 클린 아키텍처, 헥사고날, tdd, ddd 모든건 방법론일뿐이다. → 우리 상황에 맞다고 생각되는 것만 가져가자.
우리가 지켜야할 부분 그리고 유연하게 가져가야할 부분(레이어)는 명확하다 → 인프라 레이어( 이 부분이 아이러니 한데 DIP 때문에 그렇습니다. 우리가 지킬건 service(비즈니스 로직)이고 infra는 도구이다.)




제가 참고한 서적과 글을 아래 링크로 공유 드립니다.

카카오스타일 헥사고날 아키텍처(블로그)

카카오페이 헥사고날 아키텍처에서 다시 계층형구조로(블로그)

만들면서 배우는 클린아키텍처(서적)

엔터프라이즈 애플리케이션 아키텍처 패턴(서적) (아직 읽는중)

토비의 만들면서 배우는 클린아키텍처(강의)

계층형구조 Layered Architecture
절차적 프로그래밍으로 인도

기존에 모든 cjone 애플리케이션의 경우 계층형 구조로 작성되어 있었습니다. 계층형 구조는 주로 절차형 프로그래밍의 산물이라고 생각합니다. 

절차형 프로그래밍이란? 위키피디아 정의는 아래와 같습니다.

절차적 프로그래밍(節次的 프로그래밍, 영어: procedural programming)은 절차지향 프로그래밍 혹은 절차지향적 프로그래밍이라고도 불리는 프로그래밍 패러다임의 일종으로서, 때때로 명령형 프로그래밍과 동의어로 쓰이기도 하지만, 프로시저 호출의 개념을 바탕으로 하고 있는 프로그래밍 패러다임을 의미하기도 한다. 프로시저는 루틴, 하위프로그램, 서브루틴, 메서드, 함수(수학적 함수와는 다르고 함수형 프로그래밍에 있는 함수와는 비슷한 의미이다.)라고도 하는데, 간단히 말하여 수행되어야 할 연속적인 계산 과정을 포함하고 있다. 프로그램의 아무 위치에서나 프로시저를 호출할 수 있는데, 다른 프로시저에서도 호출 가능하고 심지어는 자기 자신에서도 호출 가능하다.




여기서 집중해야할 문장은 "수행되어야 할 연속적인 계산 과정을 포함하고 있다. " 입니다. 이처럼 service에 많은 내용을 포함하여 우리는 transaction script를 작성하게 됩니다. 그럼 이게 왜 문제인지 생각 해봐야 할거 같네요.

Usecase, 즉 서비스는 비즈니스 로직입니다. 우리가 정의한 비즈니스는 보호해야하는 대상입니다. 만약 비즈니스 로직을 반복적으로 수정하더라도 기존 로직이 깨지지 않았는지 확인할 수 있는 수단이(테스트) 잘 작성되어 있다면,

우리는 하나의 비즈니스에 대해 잘 검증할 수 있습니다.

하지만 하나의 비즈니스에 다양한 비즈니스간 의존성과 우리의 서비스와 무관한 Infra가 함께 의존하고 있다면 이는 테스트하기 어려울수 밖에 없고 다른 담당자가 변경해야한다면, 기존에 작성한 비대해진 service내의 transaction script를 하나하나 파악해야 합니다.

(절대 절차 지향이 잘못됬다는 의미가 아닙니다. 제 생각에는 기능 단위로 잘 작성된 코드는 언제든지 단위테스트를 작성하기 쉬운 코드라고 생각합니다. 이러한 코드는 Java가 각광 받은 이유인 OOP와도 연관이 있습니다.)

Java is a high-level, general-purpose, memory-safe, object-oriented programming language. It is intended to let programmers write once, run anywhere (WORA),[17] meaning that compiled Java code can run on all platforms that support Java without the need to recompile. - wikipedia 




      2. 확장에 대해 닫혀있는 구조

위 그림은 우리가 주로 사용하던 계층형 구조입니다. 극단적인 예로 Service를 개발하기 위해서는 반드시 Repository가 필요하고, Controller(presentation)을 개발하기 위해서는 Service개발이 완료 되어야 합니다. 각 화살표의 흐름처럼 계층간에 강하게 결합하기 때문에 이는 앞서 언급한 테스트에 닫혀있는 구조라고 볼 수 있습니다. 뿐만 아니라 Service 계층이 수정된다면, Controller가 Repository가 변경된다면 Service가 변경되어야 하는 구조입니다.

즉 연쇄적입니다.




(repository, mapper가 class type이 interface니까 추상화 된거 아닌가? 생각이 들수도 있으실거 같아요. interface가 순수 기능 jpa, mybatis의 의존적이지 않은것이 추상화입니다.)

하나의 코드 예시를 보면, 

@Transactional // DB 트랜잭션 안에 S3, Redis, PG 호출이 다 섞여 있음
public PaymentResult processPayment(PaymentCommand command) {
    // DB 저장
    paymentRepository.save(payment);   // DB 트랜잭션
    pgClient.requestPayment(pgRequest); // 외부 API (트랜잭션 X)
    amazonS3.putObject(...);            // S3 (트랜잭션 X)
    redisTemplate.set(...);            // Redis (트랜잭션 X)
    // DB 롤백되어도 PG 결제, S3 업로드는 이미 완료됨
}




위 코드를 테스트 할때 검증해야하는 부분은 오로지 결제가 정상적으로 생성되는지?입니다.

하지만 service나 infra에 추상화가 없어 우리는 processPayment을 테스트하게 될때, 외부 API, s3 파일 적재, requestPayment 등에 대해 모두 처리해야함과 동시에 비즈니스 로직 흐름에 포함됩니다.




그럼 위와 같은 코드를 테스트 한다면 어떻게 해야할까요? 우선 test 환경에서 우리는 강하게 결합하고 있는 service에 대해 stubbing을 해주는 방법 밖에 없습니다. 그리고 infra의 경우에도 테스트가 정상적으로 되어 각 케이스별로 적재되었는지 확인할 수 있는 방법이 없습니다. 직접 repository에 의존하고 있어 이부분에도 stubbing이 필요하기 때문이죠.

service로직은 fakeObject나 dummy를 넣기 보다 mocking이 있기 때문에 테스트하기 쉬운편이지만,

infra 와 같은기반 기술들은 보통 외부로 나가기 때문에 추상화를 하지 않는다면 service 로직 테스트 작성에 어려움이 있습니다. (여기서 더 깊은 개념으로 나아가려면 DDD의 개념을 잘 알아야합니다.)
이렇게 많은 외부 인프라 기술에 직접적으로 의존하는 service로직을 작성한다면 신규 기능 개발을 하기 어려워 지는데요. 뿐만아니라 기존에 이미 작성된 코드에 대해 하나의 단위 test 코드를 작성하기 어렵습니다. 단적인 예로 우리의 브랜드프로필 코드를 살펴보면 현재 강하게 결합하고 있는 기반 기술들은 Mocking을 할수 밖에 없습니다.

그러면 우리가 테스트할 수 있는 방법은 UI 테스트만 남게 됩니다. 이러한 점이 왜 문제가 될까요?

내가 수정한 부분은 단순한 알림 기능인데 같은 작은 기능만 테스트하면 되는데, 전체 flow(UI)를 통해 테스트함으로써 많은 리소스가 들어가게 됩니다. 그리고 만약 해당 비즈니스 로직을 처음보는 사람은 단순한 추가 기능을 구현해야한다면, 개발보다 기존에 작성된 코드를 이해하기 위해 더 많은 시간을 들여야합니다.




뿐만아니라 계층 구조에서는 위 코드블락 내 requestPayment에 가입시 kakao 채널에 메시지를 보내는 기능을 추가한다면 우리는 비즈니스 로직을 손을 대어야 합니다. 카카오 채널에 메시지를 보내는 기능은 외부 시스템인데 우리 비즈니스에 침투하는 것과 같은 일이 발생하는 거죠.




이야기가 너무 길어지니 이만 줄이고 다시 계층 구조의 문제점으로 돌아오겠습니다.

제가 하고 싶은 말은 한번 비대해진 service는 다시 쪼개어 설계하거나 간단하게 만드는데는 많은 리소스가 들어갑니다. 기존에 담당했던 담당자가 다시 추가하거나 개발할 수 있는 상황만 보장된다면 쉽게 수정할 수 있을거 같은데요. 하지만 개발을 하다보면 여러 상황(퇴사, 전배, 휴가 등 )이 있을 수 있다고 생각합니다.

테스트 코드 없이 해당 서비스를 운영할 경우에는 이후 서비스 내용이 추가 변경될 시에 많은 영향이 갈것이고 앞서 언급했듯이 테스트 코드의 부재로 직접 테스트(UI)하는데도 많은 리소스가 들어갑니다. (모든 추가 기능 개발을 하면 당연히 E2E 테스트는 해야합니다. 수정 할때마다 E2E 테스트로 디버깅하는것이 우리를 힘들게 한다는 의미입니다.)

그래서 우리는 서비스가 적당히 커질때마다 이를 별도 domain으로 따로 분리하여 관리할지 그게 아니라면 domain내에 고정적으로 사용되는 모델들은 포함을 시켜 개발하는 습관을 들이는 것이 유지보수하는 측면에서 도움이 될거라고 생각합니다. 무조건 작은 단위로 분리하고 보일러 플레이트를 늘리는것보단 over-under engineering 사이의 균형을 잘 맞추는게.. 우리가 궁극적으로 추구해야하는 방향이라고 생각합니다.




결론적으로 이러한 계층형의 한계점을 극복하기 위해 클린 아키텍처 기반의 헥사고날 아키텍처가 등장했습니다.
