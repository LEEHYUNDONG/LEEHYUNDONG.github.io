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
> 다양한 구현체가 있고, 그중에서 특정한 구현체를 만들 수 있는 다양한 팩토리, 그리고 사용하는 서브클래스에 따라 생산되는 객체 인스턴스가 결정된다.(생산자 클래스가 실제 생산될 제품을 전혀 모르는 상태로 유지됨.)

## 개념

Factory Method 패턴은 객체 생성을 서브클래스에 위임하는 생성(Creational) 디자인 패턴이다. 기존에 팩토리 메서드 패턴이 abstract method나 class로 구현되었는데, Java 8버전 이후부터는 충분히 interface로도 팩토리 메서드 패턴을 구현할 수 있게 되었다.

### 핵심 원리

1. **객체 생성 위임**: 상위 클래스에서 객체 생성 인터페이스를 정의하고, 실제 생성은 서브클래스에서 담당
2. **느슨한 결합**: 생산자 클래스가 실제 생산될 제품을 알 필요 없음
3. **다형성 활용**: 동일한 인터페이스로 다양한 구현체 생성 가능

### 장점

- 유연한 상속 구조 (다중 구현 가능)
- 더 가벼운 구조 (행동만 공유할 때 적합)
- default 메서드 활용으로 코드 간결성 향상
- 개방-폐쇄 원칙(OCP) 준수

### 단점

- 클래스 수가 증가할 수 있음
- 간단한 객체 생성에는 과도한 구조

### 업무 적용

저의 경우 판매 원장 도메인에 팩토리 메소드 패턴을 적용했습니다.
해당 영역은 서로 다른 5가지 원장 타입이 존재했고, 비즈니스 상황에 따라 원장이 추가되거나 제거될 가능성이 높은 구조였습니다.

예를 들어 상영 콘텐츠, 상품 원장은 비교적 안정적으로 유지되는 반면,
영화관의 공간 사업, 기타 신규 사업 원장은 언제든지 대체되거나 새롭게 확장될 수 있는 특성을 가지고 있었습니다.

이러한 변동성을 고려하여,
계정계에서 원장을 조회하는 로직을 원장별 구현체로 분리하고 팩토리 메소드를 통해 객체 생성을 위임함으로써
__변경에는 닫혀 있고(Open/Closed Principle), 확장에는 열려 있는 구조로 설계했습니다.__

그 결과,
•	신규 원장이 추가되더라도 기존 로직을 수정하지 않고 확장이 가능했고
•	각 원장별 책임이 명확해져 유지보수성이 향상되었습니다.

또한, 이 구조는 Application 레벨에서 반환된 원장 데이터를 추가 가공하거나 후처리하는 데에도 유리했습니다.
공통 인터페이스를 기반으로 동작하기 때문에, 원장 타입에 따른 분기 없이 일관된 흐름으로 비즈니스 로직을 구성할 수 있었습니다.

결과적으로,
팩토리 하나를 통해 필요한 원장 객체를 유연하게 생성하고 활용할 수 있었고,
가벼운 구조를 유지하면서도 객체지향 원칙을 자연스럽게 적용하여
코드의 간결성과 확장성을 동시에 확보할 수 있었습니다.



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
        │                 │
        ▼                 ▼
┌────────────────┐ ┌────────────────┐
│ConcreteProductA│ │ConcreteProductB│
└────────────────┘ └────────────────┘
```

![img.png](/assets/images/img.png)



## 코드

### 1. Product 인터페이스

```java
interface Product {
    String operation();
}
```

### 2. 구체 클래스 - ConcreteProductA

```java
class ConcreteProductA implements Product {
    @Override
    public String operation() {
        return "ConcreteProductA의 작업 실행";
    }
}
```

### 3. 구체 클래스 - ConcreteProductB

```java
class ConcreteProductB implements Product {
    @Override
    public String operation() {
        return "ConcreteProductB의 작업 실행";
    }
}
```

### 4. Creator 인터페이스 (Factory)

```java
interface Creator {
    // 팩토리 메서드
    Product factoryMethod();

    // Default 메서드로 구현된 someOperation
    default String someOperation() {
        Product product = factoryMethod();
        return "Creator: " + product.operation();
    }
}
```

### 5. 구체 Creator 클래스들

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

### 6. 클라이언트 코드

```java
public class Main {
    public static void main(String[] args) {
        Creator creatorA = new ConcreteCreatorA();
        System.out.println(creatorA.someOperation());

        Creator creatorB = new ConcreteCreatorB();
        System.out.println(creatorB.someOperation());
    }
}
```



## 실행 결과

```
Creator: ConcreteProductA의 작업 실행
Creator: ConcreteProductB의 작업 실행
```




## 추상클래스 vs 인터페이스

| 항목 | 추상클래스 | 인터페이스 (Java 8+) |
||--||
| 상속 | 단일 상속만 가능 | 다중 구현 가능 |
| 상태 | 필드(상태) 보유 가능 | 상수만 가능 |
| 메서드 | 일반/추상 메서드 모두 가능 | default/static 메서드 지원 |
| 적합한 경우 | 공통 상태가 필요할 때 | 행동만 공유할 때 |



## 팩토리 메서드 패턴이 유용한 경우

1. 객체 생성 로직이 복잡하거나 변경 가능성이 있을 때
2. 코드의 확장성이 요구될 때
3. 상위 클래스에서 하위 클래스 인스턴스를 제어해야 하는 상황

---

<br/>
<br/>


# 템플릿 메소드 패턴
> 템플릿 메소드 패턴은 동일한 형식과 제조법을 가진 서로 다른 객체의 기능을 공통적으로 묶어서 처리할 수 있습니다. 쉽게 말해 알고리즘 골격을 정의하고 일부 단계는 서브클래스에게 위임하여 처리할 수 있습니다.
> 공통적인 기능은 묶어서 처리하고 다른 기능은 객체간 독립적으로 처리할 수 있습니다. 뿐만 아니라 알고리즘 골격은 서브 클래스에서 재정의 할 수 있습니다.


## 개념

Template Method 패턴은 알고리즘의 골격을 상위 클래스에서 정의하고, 세부 구현은 하위 클래스에서 담당하도록 하는 행위(Behavioral) 디자인 패턴이다.

### 핵심 원리

1. **알고리즘 골격 정의**: 상위 클래스에서 전체 실행 흐름을 `final` 메서드로 정의하여 변경 불가능하게 함
2. **Hook Method**: 하위 클래스에서 반드시 구현해야 하는 추상 메서드 제공
3. **코드 재사용**: 공통 로직은 상위 클래스에, 변경되는 부분만 하위 클래스에 구현

### 장점

- 코드 중복 제거
- 알고리즘 구조 변경 없이 특정 단계만 재정의 가능
- 개방-폐쇄 원칙(OCP) 준수

### 단점

- 하위 클래스가 상위 클래스에 강하게 결합
- 알고리즘 단계가 많아지면 유지보수 어려움

### 업무적용
Template Method 패턴을 적용하여 광고 트래킹 시스템의 코드 중복 문제를 해결했다. 기존에는 노출/클릭/redirect 엔드포인트마다 별도 서비스를 구현하여 동일한 로직을 반복 작성했으나, 
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
│ - name: String                  │
├─────────────────────────────────┤
│ + generate(): void {final}      │  ← Template Method
│ - defineProblem(): void         │
│ - search(): void                │
│ - answer(): void                │
│ # algorithm(): void {abstract}  │  ← Hook Method
│ # askQuestion...(): void {abs}  │  ← Hook Method
└─────────────────────────────────┘
              △
              │
    ┌─────────┴─────────┐
    │                   │
┌───────────┐     ┌───────────┐
│  ChatGpt  │     │  Claude   │
├───────────┤     ├───────────┤
│algorithm()│     │algorithm()│
│askQuestion│     │askQuestion│
└───────────┘     └───────────┘
```

![img.png](/assets/images/img2.png)


## 코드

### 1. 추상 클래스 (Template)

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
        askQuetionAboutMoreInformation();
    }

    // 공통 구현
    private void defineProblem() {
        System.out.println(name + "문제를 정의합니다.");
    }

    private void search() {
        System.out.println(name + "문제를 해결하기 위해 검색합니다.");
    }

    private void answer() {
        System.out.println(name + "가 답변합니다.");
    }

    // Hook Method - 하위 클래스에서 구현
    protected abstract void algorithm();
    protected abstract void askQuetionAboutMoreInformation();
}
```

### 2. 구체 클래스 - ChatGpt

```java
public class ChatGpt extends GenerativeAi {

    private static final String name = "ChatGpt";

    public ChatGpt() {
        super(name);
    }

    @Override
    public void algorithm() {
        System.out.println("ChatGPT 방식으로 해결해보려 합니다.");
    }

    @Override
    public void askQuetionAboutMoreInformation() {
        System.out.println("ChatGPT가 더 필요한 정보가 없는지 제대로 답변했는지 질문합니다.");
    }
}
```

### 3. 구체 클래스 - Claude

```java
public class Claude extends GenerativeAi {

    private static final String name = "Claude";

    public Claude() {
        super(name);
    }

    protected void algorithm() {
        System.out.println(name + " 방식으로 해결해보려 합니다.");
    }

    protected void askQuetionAboutMoreInformation() {
        System.out.println(name + "가 더 필요한 정보가 없는지 제대로 답변했는지 질문합니다.");
    }
}
```

### 4. 클라이언트 코드

```java
public class GenerativeAiApp {
    public static void main(String[] args) {
        GenerativeAi claude = new Claude();
        claude.generate();

        GenerativeAi chatGpt = new ChatGpt();
        chatGpt.generate();
    }
}
```



## 실행 결과

```
Claude문제를 정의합니다.
Claude문제를 해결하기 위해 검색합니다.
Claude 방식으로 해결해보려 합니다.
Claude가 답변합니다.
Claude가 더 필요한 정보가 없는지 제대로 답변했는지 질문합니다.
ChatGpt문제를 정의합니다.
ChatGpt문제를 해결하기 위해 검색합니다.
ChatGPT 방식으로 해결해보려 합니다.
ChatGpt가 답변합니다.
ChatGPT가 더 필요한 정보가 없는지 제대로 답변했는지 질문합니다.
```



## Before vs After 비교

| 항목 | Before | After |
||--|-|
| 코드 중복 | `generate()` 메서드가 각 클래스에 중복 | 공통 로직은 상위 클래스에 집중 |
| 확장성 | 새 AI 추가 시 전체 로직 복사 필요 | 추상 메서드만 구현하면 됨 |
| 유지보수 | 공통 로직 변경 시 모든 클래스 수정 | 상위 클래스만 수정 |
| 알고리즘 순서 보장 | 각 클래스에서 순서 변경 가능 | `final` 메서드로 순서 고정 |


