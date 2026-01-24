---
layout: post
toc: true
title: "광고 시스템 아키텍처"
categories: Work
tags: [광고]
author:
  - 이현동
---


## 광고 트래킹 시스템 아키텍처

![광고 트래킹 시스템](/assets//images/광고트래킹시스템.png)

현재 광고 트래킹 시스템의 경우 데이터가 유실되지 않도록 pub/sub 시에 각각 다른 형태로 데이터의 유실율을 낮추고 있다.
__메시지가 발행되는 시점__ 에는 기존 로깅 시스템과 별도로 MDC로 구분하여 로깅하고, 이를 광고 배치 시스템에서 읽어 20분 단위로 실제 데이터의 유실을 확인한다.

__메시지가 소비되는 시점__ 에는 소비하며 발생하는 오류건은 Dead Letter Queue에 적재되면 이는 별도 Consumer를 통해 비동기로 Dynamo Db에 Cause와 함께 저장된다.


## 광고 트래킹 성능 튜닝

### TPS 산정 배경

#### 기준 트래픽 분석
- **iOS**: 600 TPS
- **Android**: 400 TPS
- **합계**: 1,000 TPS (평시 기준)

#### 피크 트래픽 고려
이벤트 진행 시 트래픽 버스트가 **1.5배 ~ 2배**까지 증가하는 패턴을 확인했습니다. 평시 1,000 TPS 기준으로 계산하면:
- **예상 피크**: 1,500 ~ 2,000 TPS

#### 광고 노출 위치에 따른 트래픽 변동
현재 App Main 화면에서 광고는 3번째, 6번째 위치에 배치되어 있습니다. 만약 CJONE 광고가 피드의 첫 번째 슬롯으로 이동한다면, **전체 TPS를 그대로 수용**해야 하는 상황이 발생할 수 있습니다.

#### 최종 목표 TPS 설정
안전 마진 20% (약 500 TPS)를 추가하여 **최종 목표 TPS를 2,500**으로 산정했습니다.

#### 실제 운영 데이터
v4.0 오픈 후 이벤트 진행 당시, 기존 TPS 대비 약 **2배의 버스트**가 실제로 발생했습니다. 당시 광고 구좌는 3, 6, 9(네이버), 12번째 등으로 분산 배치되어 있어, 예측했던 TPS보다는 낮은 트래픽이 발생했습니다.

---


### 초기 아키텍처: Amazon SQS

#### SQS 도입 배경
광고 플랫폼 초기 구축 단계에서 빠른 개발과 안정적인 운영을 위해 **완전 관리형 서비스인 Amazon SQS**를 메시지 큐로 선택했습니다.

#### SQS 성능 제약사항
AWS 공식 문서에 따르면, SQS fifo Queue는 단건 전송 기준(높은처리량 모드가 아닐시) Asia Region에서 [**최대 300 TPS**](https://docs.aws.amazon.com/ko_kr/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html)를 지원합니다.

#### 배치 전송의 필요성
목표 성능인 **2,500 TPS**를 달성하기 위해서는 단건 전송으로는 불가능하며, **배치 전송(Batch Send)**을 활용할 수밖에 없었습니다. 실제로 K6로 약 500 TPS로 단건 전송 시에 403 Throttled Error가 AWS 측에서 리턴되는 것을 확인하였다.
이후 High Throughput 설정과 배치 전송으로 더 높은 트래픽을 유지할 수 있을것이라고 생각했다.


### 트래킹 시스템 메시지 전송 구간 설계
```bash
HTTP Request (Impression / Click)
        ↓
RateLimiter (TPS 상한)
        ↓
In-Memory Buffer (ConcurrentHashMap)
        ↓
Batch Flush (size or time)
        ↓
Semaphore (동시 inflight 제한)
        ↓
SQS SendMessageBatch (AWS SDK)
```

### 성능 개선 결과

#### SQS 배치 전송 최적화
- 달성 TPS: 2,500 TPS (목표 2,500 대비 100%)
- 평균 레이턴시: 10 ms
- 메시지 유실률: 0.00%

#### 한계점 및 개선 방향
- High Throughput 모드에서도 3000 TPS 이상에서 간헐적 Throttling 발생
- Kafka 전환 검토 시작

### 교훈 및 향후 과제

#### 얻은 교훈
- 관리형 서비스(SQS)는 빠른 구축에 유리하나, 대규모 트래픽엔 한계
- 배치 처리와 Rate Limiting을 통한 안정성 확보 필수
- 메시지 유실 방지 위한 다층 모니터링 체계 중요

#### 향후 개선 방향
- SQS -> Kafka(MSK)로 전환