---
layout: post
toc: true
title: "광고 시스템 아키텍처 설계"
categories: Work
tags: [광고]
author:
  - 이현동

---


## 광고 트래킹 시스템 아키텍처

![광고 트래킹 시스템](/images/ads_tracking.png)

### 요약
현재 광고 트래킹 시스템의 경우 데이터가 유실되지 않도록 pub/sub 시에 각각 다른 형태로 데이터의 유실율을 낮추고 있다.
__메시지가 발행되는 시점__ 에는 기존 로깅 시스템과 별도로 MDC로 구분하여 로깅하고, 이를 광고 배치 시스템에서 읽어 20분 단위로 실제 데이터의 유실을 확인한다.

__메시지가 소비되는 시점__ 에는 소비하며 발생하는 오류건은 Dead Letter Queue에 적재되면 이는 별도 Consumer를 통해 비동기로 Dynamo Db에 Cause와 함께 저장된다.


#고민

# 광고 시스템 설계 관점

광고 트래킹을 처리할 수 있는 아키텍처를 고안하기 위해 다음과 같은 고민을 했다.
### RDB 적재 가능?
특정 TPS 미만에 좋은 성능의 database가 존재하다면 가능하다고 생각했다.
- Aurora 적절히 튜닝시 1000 TPS 이상 쓰기 가능
- Batch Insert 활용 가능: JDBC Batch로 10-100건 묶으면 성능 향상
- Connection pool 최적화

### 실제로 db 적재를 고려했었다..
초기에는 약 500~600 TPS를 기준으로, 모바일 앱에서 광고 트래킹 API를 호출해 사용자 이벤트를 Aurora PostgreSQL에 직접 적재하는 구조로 시스템을 가져가려고 했었다.
이 구조에서의 문제는 초당 약 500건의 commit이 DB로 유입되며, 트래픽이 목표 TPS를 초과할 경우 DB 부하 증가 및 장애로 이어질 가능성이 있다고 판단했다. 이에 따라 요청을 적절한 트랜잭션 단위로 묶어 commit 횟수를 줄이고, 이를 통해 DB 커넥션 사용량을 안정화 하기 위해 MyBatis 기반 batch insert 방식을 적용했다.

#### 왜 사용하지 않았을까?
광고의 비즈니스 관점에서 바라 보았을때 광고를 송출하는 db는 광고 센터에서 등록하고 수정하는 database와 동일한 것이다. 그리고 이 db는 트래킹을 처리하는 database와 동일하기 때문에 트래킹만 처리하기 위해 사용할 수 없었다.

1. **버스트 트래픽 처리 불가**
    - API 응답 시간 영향이 있다, 직접 적재시에 200-500ms의 DB 쓰기 대기가 발생
    - Network issue -> timeout 발생
2. DB 장애/재시작 -> 요청 유실
    - db connection pool 점유
    - 데이터 유실에 대해 처리할 수 있는 방법이 없다. 즉 안정성이 떨어지는 것이다.


데이터 유실을 막기 위해 세가지 레이어가 있었다.

1차: API Throttle w/ rateLimiter
2차: Producing 전 MDC audit에 sqs 로깅을 표시 -> Fluent-bit → S3 → 파일 로그를 읽어 Batch를 통해 유실율 확인 유실이 있다면 원시 데이터 insert
3차: DLQ (알림 및 오류 적재)

2차 레이어의 경우 batch는 다른 개발자 분이 작업하셨다. batch에서 저장된 원시 데이터와 file logging한 데이터를 20분 이전 파일 로그부터 확인하여 원본테이블에 적재된 시간 기준으로 비교하여 집계를 통해 유실을 확인할 수 있도록 개발되어 있다.


### 재처리를 한다면 어디에 걸었어야했을까?
그럼 재처리를 어느 구간에 걸었어야 할까.. 우선 각각 행위 관점으로 살펴보면 책임은 아래와 같다.
[Producer 책임] API → SQS 발행 성공 보장 "데이터가 시스템에 진입했는가?"
[Consumer 책임] SQS → DB 적재 성공 보장 "진입한 데이터가 저장됐는가?"

우선 메시지를 발행하는 시점에서 시나리오는 다음과 같을거 같다.
1. SQS API throttling (TPS 상한)
2. Network timeout
3. SQS 장애 (503)
   거의 발생하지 않는다.

client(광고가 송출되는 mobile app)는 우선 실패하더라도 항상 200 OK 응답 상태만 받도록 설계되어 있고 Queue에 메시지를 적재하지 못하는 상황은 주로 aws쪽의 일시적 오류나 장애 상황이라고 판단했다.
따라서 fluent-bit로 파일로깅 pipeline이 있었고 MDC로 구분하여 배치쪽에서 처리하는 로직으로 producer 측에서의 유실을커버할 수 있다고 생각했다.

물론 아직까지 aws에서 장애가 났거나 오류가 발생하여 유실된 메시지는 없었다.(배치쪽 원시값-배치에서 저장하려는 값 비교 테이블을 통하여 확인)

Consumer 측 재처리를 알아보기 전에 **Visibility Timeout** 이 뭔지 살펴보는게 좋을거 같다.
Consumer가 메시지를 receive하면 그 메시지는 visibility timeout 동안 다른 consumer에게 보이지 않는다. 이 시간 내에 메시지를 처리하고 delete하지 않으면, 메시지가 다시 큐에 visible 상태가 되어 재처리된다.

![visibility timeout](/images/1_vt.png)

→ 이게 **자동 retry의 핵심 메커니즘**이다.

Consumer 측에서 발생할 수 있는 오류 시나리오
1. 네트워크 timeout
2. DB 접근 불가
3. 메시지 포맷 문제 (json 포멧, 테이블 문제)
   실제로 3번 시나리오 외에는 발생한 문제는 없었다. staging 서버에서 잘못된 앱 배포로 인해 DLQ에 쌓이는 상황이 5% 미만 해당 문제가 발생했었다.

우선 현재 구조에서 Consumer 측 재처리를 고려해야할 상황은 없다고 판단했다. 그 이유는 app의 header(user-agent, locale, ..) 의 데이터 외에는 전부 광고 송출시에 client에게 우리가 event type 별로 url을 queryString을 붙여서 내려주기 때문에 대부분의 데이터는 우리로부터 제공되었다.

