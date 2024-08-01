# Item2. 생성자에 매개변수가 많다면 빌더를 고려하라

> 일반 생성자는 선택적 매개변수가 많을경우 적절히 대응하기가 어렵다.


영양정보 클래스를 통하여 좀 더 이해해보도록 하자.

## 점층적 생성자 패턴(확장 어려움)

```java
public class NutritionFacts {
    private final int servingSize;
    private final int servings;
    private final int calories;
    private final int fat;
    private final int sodium;
    private final int carbohydrate;

    public NutritionFacts(int servingSize, int servings, int calories, int fat, int sodium, int carbohydrate) {
        this.servingSize = servingSize;
        this.servings = servings;
        this.calories = calories;
        this.fat = fat;
        this.sodium = sodium;
        this.carbohydrate = carbohydrate;
    }

    public NutritionFacts(int servingSize, int servings) {
        this(servingSize, servings, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories) {
        this(servingSize, servings, calories, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories, int fat){
        this(servingSize, servings, calories, fat, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories, int fat, int sodium){
        this(servingSize, servings, calories, fat, sodium, 0);
    }
}

```

점층적 생성자 패턴으로 필수 매개변수와 선택 매개변수 1개를 받는 생성자 모두 받는 생성자까지 점차 생성자 매개변수를 늘리는 방식이다.
이 클래스의 인스턴스를 만들려면 원하는 매개변수를 모두 포함한 생성자 중 가장 짧은 것을 골라 호출하면 된다.


__점층적 생성자 패턴도 쓸 수 있지만, 매개변수가 많아지면 클라이언트 코드를 작성하거나 읽는데 어려움이 있다.__

## 자바빈즈 패턴(JavaBeans pattern)(일관성이 깨지고 불변 x)
> 매개변수가 없는 생성자로 객체를 만들어 세터 메서드를 호출하여 원하는 매개변수 값을 설정하는 방식

```java
public class NutritionFactsWithJavaBeansPattern {
    private int servingSize = -1; // Required; no default value
    private int servings = -1; // Required; no default value
    private int calories = 0;
    private int fat = 0;
    private int sodium = 0;
    private int carbohydrate=0;
    
    public NutritionFactsWithJavaBeansPattern() {
    }

    public void setServingSize(int servingSize) {
        this.servingSize = servingSize;
    }

    public void setServings(int servings) {
        this.servings = servings;
    }

    public void setCalories(int calories) {
        this.calories = calories;
    }

    public void setFat(int fat) {
        this.fat = fat;
    }

    public void setSodium(int sodium) {
        this.sodium = sodium;
    }

    public void setCarbohydrate(int carbohydrate) {
        this.carbohydrate = carbohydrate;
    }
}
```

자바빈즈 패턴은 객체 하나를 만들려면 메서드를 여러개 호출해야 하고, 객체가 완전이 생성되기 전까지 일관성이 무너진 상태에 놓이게 된다.
