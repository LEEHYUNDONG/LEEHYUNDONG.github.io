---
layout: post
toc: true
title: "PostgreSql를 왜쓸까"
categories: Design_Patterns
tags: [ database ]
author:
  - 이현동
---

현재 회사에서는 AWS Aurora PostgreSQL을 사용하고 있다. 그런데 사실 나는 PostgreSQL을 잘 몰랐다. 지금도 완전히 안다고 말하긴 어렵지만, 이번 기회에 조금이라도 제대로 이해해보려고 학습한 내용을 정리해보려 한다.
취업 준비생 시절에는 데이터베이스 관련 질문을 달달 외우면서도 “백엔드 엔지니어가 이런 것까지 알아야 하나?”라는 생각을 자주 했었다. 하지만 지금은 그 생각이 완전히 바뀌었다.
관계형 데이터베이스는 NoSQL에 비해 특정 상황에서 성능적으로 불리할 수 있음에도, 여전히 대부분의 시스템에서 널리 사용된다. 
**그 이유는 NoSQL만으로는 해결하기 어려운 중요한 요소들이 존재하기 때문이다.**

1. 데이터 정합성(재고, 회계)
2. 데이터의 무결성
3. 복잡한 쿼리의 데이터 집계 처리 가능성
4. 타입의 강제성
5. 트랜잭션을 제공(결제, 주문, 금융)

위와 같은 이유에서 RDBMS는 필수적이다. 그래서 현재 내가 다루고 있는 postgreSql에 대해 알아보자.

## PostgreSql의 특징

(작성중)


### 여러가지 인덱스 종류를 제공한다

- b-tree
- hash
- Gist(Generalized Search Tree)
- GIN (Generalized Inverted Index)
- BRIN(Block Range Index)
- SP-GiST(space-Partitione GiST)


### index가 왜 필요할까

적은 row에서는 오히려 비효율적일 수 있음.
인덱스 사용시

1. 인덱스 페이지 읽기 (b-tree 탐색)
2. heap 페이지 읽기 (실제 데이터)
3. 최소 2번의 io

full scan

1. 테이블 페이지 순차 읽기
2. 연속된 i/o 빠름

### index column의 순서가 왜 중요할까?

B-Tree 인덱스의 정렬 방식과 최좌측 접두사 규칙 때문이다. B-Tree 인덱스 정렬 구조는 아래와 같은 방식으로 동작한다.

#### B-Tree

B-Tree 인덱스의 정렬 구조는 아래와 같다.

```
전화번호부 시
- 성 A로 먼저 정렬
- 같은 성 내에서 이름(B)로 정렬
- 같은 이름 내에서 중간이름(C)로 정렬

김(A) - 민수(B) - 1(C)
김(A) - 민수(B) - 2(C) 
김(A) - 영희(B) - 1(C)


-- 내부 구조


user_id | created_at | status | (row pointer) 
--------|---------------------|--------|--------------- 
1 | 2024-01-01 10:00:00 | PAID | → row#123 
1 | 2024-01-02 11:00:00 | PENDING| → row#124 
1 | 2024-01-03 12:00:00 | PAID | → row#125 
2 | 2024-01-01 09:00:00 | PAID | → row#126 
2 | 2024-01-02 10:00:00 | PAID | → row#127
```

#### 최좌측 접두사 규칙 (Leftmost Prefix Rule)

**인덱스는 왼쪽부터 순차적으로만 사용 가능합니다.**

컬럼 순서 결정 기준

1. 쿼리 패턴 우선

- 가장 자주 사용되는 where 조건 앞에 배치한다.

```sql
INDEX
(user_id, created_at, status)
```

2. 카디널리티

- 일반적으로 선택도 높은(유니크한 값이 많은) 컬럼을 앞에 배치

```sql
-- user_id: 100만 개 (카디널리티 높음) 
-- status: 3개 값 (PAID, PENDING, CANCELLED) (카디널리티 낮음) 
-- created_at: 수십만 개 (카디널리티 높음) -- 일반적인 권장 

INDEX
(user_id, created_at, status)
```

3. 등호(=) vs 범위(>, <, BETWEEN)

```sql
-- 등호 조건을 앞에, 범위 조건을 뒤에 INDEX(user_id, status, created_at) 
SELECT *
FROM orders
WHERE user_id = 1     -- 등호 
  AND status = 'PAID' -- 등호 
  AND created_at > '2024-01-01'; -- 범위

```

실무관점에서 신경쓰면 좋은 부분

1. 다중 인덱스 전략
2. INCLUDE 컬럼 활용(커버링 인덱스로 고려 인덱스 키로 직접 넣지 않는다.)
3. 파티셔닝과 함께 고려
    - 시간 기반 파티셔닝 + 인덱스
    - 만약 파티셔닝이 고려 되어 있다면 인덱스에서는 우선순위를 낮춰도 된다.

### BRIN(Block Range Index)

```sql
-- 대용량 로그 테이블 
CREATE TABLE logs
(
    id         BIGSERIAL,
    created_at TIMESTAMP,
    level      VARCHAR(10),
    message    TEXT
);
-- 시간순으로 삽입되는 데이터 

CREATE INDEX idx_brin_time ON logs USING brin(created_at);

-- 내부 구조 - 물리적 블록 범위별로 메타데이터만 저장
Block
Range 1 (128 pages): created_at MIN=2024-01-01, MAX=2024-01-02 
Block Range 2 (128 pages): created_at MIN=2024-01-02, MAX=2024-01-03 
Block Range 3 (128 pages): created_at MIN=2024-01-03, MAX=2024-01-04 

인덱스 크기: 수 MB (B-Tree면 수 GB였을 것)
```

**결론**
어떤 쿼리 패턴이 주로 사용되는지에 따라 인덱스 순서가 완전히 달라진다. 특정 범위를 통해 동작하는 인덱스의 경우에는 컬럼 순서가 중요하고 그렇지 않은 등호로 동작하는 인덱스에는 순서가 큰 의미가 없는거 같다.

### index column의 순서가 왜 중요하지 않는 경우

#### Hash Index

컬럼 순서가 거의 무의미하다. 동작 원리 자체가 해시 함수로 키를 변환해서 직접 위치를 찾기 때문이다. 그러면 범위 검색시에 hash index를 사용하는 것은 무의미하지 않을까
우선 hash index의 경우 정확히 매칭이될 경우에만 동작한다.

```sql

-- 두 인덱스는 기능적으로 다름 
INDEX
hash(A, B) -- hash(A,B 조합) 
INDEX hash(B, A) -- hash(B,A 조합) 

-- 하지만 부분 매칭은 둘 다 불가능
WHERE A = 1 
WHERE B = 2 
WHERE A = 1 AND B = 2

```

#### GIN(Generalized Inverted Index)

GIN도 컬럼 순서가 무관하다. 동작 원리 자체가 전문 검색(Full-text), 배열, jsonb 등에 사용되며, 각 요소를 개별 키로 저장한다.

### 인덱스 타입별 컬럼 순서 중요도

| 인덱스 타입  | 컬럼 순서 중요도 | 주요 용도              |
|---------|-----------|--------------------|
| B-Tree  | ★★★★★     | 일반적인 정렬/범위 검색      |
| Hash    | ★☆☆☆☆     | 정확한 등호 검색          |
| GIN     | ★☆☆☆☆     | 배열, JSONB, 전문검색    |
| GiST    | ★★★☆☆     | 공간 데이터, 범위 타입      |
| BRIN    | ★★★★☆     | 대용량 시계열 데이터        |
| SP-GiST | ★★★☆☆     | 비균형 데이터 (전화번호, IP) |


<br/>

(작성중)