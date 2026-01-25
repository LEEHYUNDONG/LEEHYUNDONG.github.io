---
layout: post
toc: true
title: "내가 적용했던 디자인패턴들"
categories: Design_Patterns
tags: [design_pattern, java]
author:
  - 이현동
---


# 팩토리 메소드 패턴
> 다양한 구현체가 있고, 그중에서 특정한 구현체를 만들 수 있는 다양한 팩토리, 그리고 사용하는 서브클래스에 따라 생산되는 객체 인스턴스가 결정된다.

## 개념

Factory Method 패턴은 객체 생성을 서브클래스에 위임하는 생성(Creational) 디자인 패턴이다.

### 핵심 원리

1. **객체 생성 위임**: 상위 클래스에서 객체 생성 인터페이스를 정의하고, 실제 생성은 서브클래스에서 담당
2. **느슨한 결합**: 생산자 클래스가 실제 생산될 제품을 알 필요 없음
3. **다형성 활용**: 동일한 인터페이스로 다양한 구현체 생성 가능

### 장점

- 유연한 상속 구조 (다중 구현 가능)
- 더 가벼운 구조 (행동만 공유할 때 적합)
- default 메서드 활용으로 코드 간결성 향상
- 개방-폐쇄 원칙(OCP) 준수

### 업무 적용

저의 경우 판매 원장 도메인에 팩토리 메소드 패턴을 적용했습니다.
해당 영역은 서로 다른 5가지 원장 타입이 존재했고, 비즈니스 상황에 따라 원장이 추가되거나 제거될 가능성이 높은 구조였습니다.

이러한 변동성을 고려하여,
계정계에서 원장을 조회하는 로직을 원장별 구현체로 분리하고 팩토리 메소드를 통해 객체 생성을 위임함으로써
__변경에는 닫혀 있고(Open/Closed Principle), 확장에는 열려 있는 구조로 설계했습니다.__


## 구조

```
┌─────────────────────────────────┐
│       Creator (Interface)       │
├─────────────────────────────────┤
│ + factoryMethod(): Product      │  ← Factory Method
│ + someOperation(): String       │  ← Default Method
└─────────────────────────────────┘
              △
              │
    ┌─────────┴────────────┐
    │                      │
┌────────────────┐ ┌─────────────────┐
│ConcreteCreatorA│ │ConcreteCreatorB │
├────────────────┤ ├─────────────────┤
│factoryMethod() │ │factoryMethod()  │
└────────────────┘ └─────────────────┘
```

![img.png](/images/img.png)



## 코드

### Creator 인터페이스 (Factory)

```java
interface Creator {
    Product factoryMethod();

    default String someOperation() {
        Product product = factoryMethod();
        return "Creator: " + product.operation();
    }
}
```

### 구체 Creator 클래스들

```java
class ConcreteCreatorA implements Creator {
    @Override
    public Product factoryMethod() {
        return new ConcreteProductA();
    }
}

class ConcreteCreatorB implements Creator {
    @Override
    public Product factoryMethod() {
        return new ConcreteProductB();
    }
}
```


---

<br/>
<br/>


# 템플릿 메소드 패턴
> 템플릿 메소드 패턴은 알고리즘 골격을 정의하고 일부 단계는 서브클래스에게 위임하여 처리할 수 있습니다.

## 개념

Template Method 패턴은 알고리즘의 골격을 상위 클래스에서 정의하고, 세부 구현은 하위 클래스에서 담당하도록 하는 행위(Behavioral) 디자인 패턴이다.

### 핵심 원리

1. **알고리즘 골격 정의**: 상위 클래스에서 전체 실행 흐름을 `final` 메서드로 정의
2. **Hook Method**: 하위 클래스에서 반드시 구현해야 하는 추상 메서드 제공
3. **코드 재사용**: 공통 로직은 상위 클래스에, 변경되는 부분만 하위 클래스에 구현

### 장점

- 코드 중복 제거
- 알고리즘 구조 변경 없이 특정 단계만 재정의 가능
- 개방-폐쇄 원칙(OCP) 준수

### 업무적용
Template Method 패턴을 적용하여 광고 트래킹 시스템의 코드 중복 문제를 해결했다.
공통 로직(데이터 전처리, validation)을 템플릿으로 추출하고 각 서비스 타입별 큐 전송 로직만 서브클래스 메서드로 호출하도록 했다.

__그 결과,__
- 공통 validation 및 전처리 로직의 중복 제거
- 새로운 redirect 서비스 추가 시 개발 리소스 대폭 절감
- 코드 유지보수성 및 확장성 향상



## 구조

```
┌─────────────────────────────────┐
│      GenerativeAi (Abstract)    │
├─────────────────────────────────┤
│ + generate(): void {final}      │  ← Template Method
│ # algorithm(): void {abstract}  │  ← Hook Method
└─────────────────────────────────┘
              △
              │
    ┌─────────┴─────────┐
    │                   │
┌───────────┐     ┌───────────┐
│  ChatGpt  │     │  Claude   │
├───────────┤     ├───────────┤
│algorithm()│     │algorithm()│
└───────────┘     └───────────┘
```

![img.png](/images/img2.png)


## 코드

### 추상 클래스 (Template)

```java
public abstract class GenerativeAi {

    private final String name;

    public GenerativeAi(String name) {
        this.name = name;
    }

    // Template Method - 알고리즘 골격 정의
    public final void generate() {
        defineProblem();
        search();
        algorithm();
        answer();
    }

    // Hook Method - 하위 클래스에서 구현
    protected abstract void algorithm();
}
```

### 구체 클래스

```java
public class ChatGpt extends GenerativeAi {
    public ChatGpt() {
        super("ChatGpt");
    }

    @Override
    public void algorithm() {
        System.out.println("ChatGPT 방식으로 해결해보려 합니다.");
    }
}

public class Claude extends GenerativeAi {
    public Claude() {
        super("Claude");
    }

    protected void algorithm() {
        System.out.println("Claude 방식으로 해결해보려 합니다.");
    }
}
```
