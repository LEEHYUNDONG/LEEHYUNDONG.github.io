---
layout: post
toc: true
title: "SpringApplication.run()을 하면 어떤일이 일어날까?"
categories: spring
tags: [ spring ]
author:
  - 이현동
---

# 서론

Spring Application의 run()이 호출될 때 내부에서 어떤 일이 일어나는지, 사실 그동안 깊이 생각해본 적이 없었던 것 같다.
최근 Spring Security를 세세하게 들여다보면서 정교하게 설계된 Spring 생태계에 대한 관심이 많이 생겼고, 
시간이 날 때 실제로 애플리케이션이 어떤 방식으로 실행되는지 직접 따라가 보고 싶어졌다.

Spring Authorization Server를 공부하면서 Spring 프레임워크의 교체 용이성에 감탄하는 순간이 여러 번 있었다. 
예를 들어 /oauth2/authorize 인가 요청이 들어오면, 프레임워크는 `Web Filter` 체인을 타고 들어와 Converter에서 요청의 타입과 인스턴스를 검증한 뒤, 
Provider가 인증 처리에 필요한 AuthenticationToken을 반환하는 흐름으로 동작한다. 
만약 추가 파라미터를 받아야 하거나 인증 과정에서 별도의 처리가 필요하다면, 
`Provider`를 직접 커스텀해서 교체하거나 `Customizer`를 통해 Provider를 추가하는 것만으로 원하는 동작을 끼워 넣을 수 있다.
이 부분은 추후에 글로 자세히 남겨보려고 한다.

이러한 것 처럼 실제 SpringApplication이 동작할때 이러한 과정이 대략적으로 어떻게 일어나는지 파악해보기 위해 글로 작성해보려고 한다.

# run() 실행 시

요약하면 SpringApplication.run()을 호출하면 다음과 같은 순서로 앱이 구동된다고 한다.

**1 ~ 3. 준비 단계**

- CRaC 환경 여부 판단
- BootstrapContext 초기화 (외부 설정 서버 연동 등)
- Headless 모드 세팅

**4. RunListener**

- `SpringApplicationRunListener` 구현체들에게 시작 이벤트 전파
- Spring Cloud 등 외부 라이브러리가 이 시점에 후킹

**5 ~ 6. Environment**

- args 파싱
- `application.yml`, 환경변수, 시스템 프로퍼티 등 로드
- `ApplicationEnvironmentPreparedEvent` 발행

**7. Banner**

- 콘솔에 Spring 배너 출력
- 커스텀 `banner.txt` 적용 시점

**8. ApplicationContext 생성**

- 웹 타입에 따라 다른 컨텍스트 생성

```
Servlet  → AnnotationConfigServletWebServerApplicationContext
Reactive → AnnotationConfigReactiveWebServerApplicationContext
None     → AnnotationConfigApplicationContext
```

**9. prepareContext**

- BeanDefinition 로드 (`@SpringBootApplication` 스캔)
- `ApplicationContextInitializer` 실행
- `ApplicationPreparedEvent` 발행

**10. refreshContext(핵심)**

- Bean 생성 및 의존성 주입
- @Configuration 처리
- 내장 톰캣 시작 (웹 앱인 경우)
- @Scheduled, @Async 등 후처리

```java
public ConfigurableApplicationContext run(String... args) {

    // 1. CRaC 여부 판단
    Startup startup = Startup.create();
    startup.started();

    // 2. Bootstrap 컨텍스트 초기화
    DefaultBootstrapContext bootstrapContext = createBootstrapContext();

    // 3. 변수 선언 + Headless 세팅
    ConfigurableApplicationContext context = null;
    configureHeadlessProperty();

    // 4. RunListener 준비 및 starting 이벤트 발행
    SpringApplicationRunListeners listeners = getRunListeners(args);
    listeners.starting(bootstrapContext, this.mainApplicationClass);

    try {
        // 5. ApplicationArguments 파싱
        ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);

        // 6. Environment 준비 (application.yml 로드 등)
        ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, applicationArguments);

        // 7. Banner 출력
        Banner printedBanner = printBanner(environment);

        // 8. ApplicationContext 생성 (아직 refresh 전)
        context = createApplicationContext();

        // 9. ApplicationContext 준비 (Bean 정의 로드)
        prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);

        // 10. ApplicationContext refresh (Bean 초기화 핵심 단계)
        refreshContext(context);

        // 11. refresh 후처리
        afterRefresh(context, applicationArguments);

        // 12. 구동 완료
        startup.ready();

        // 13. started 이벤트 발행
        listeners.started(context, startup.timeTakenToStarted());

        // 14. ApplicationRunner / CommandLineRunner 실행
        callRunners(context, applicationArguments);

    } catch (Throwable ex) {
        handleRunFailure(context, ex, listeners);
        throw new IllegalStateException(ex);
    }

    // 15. ready 이벤트 발행
    listeners.ready(context, startup.ready());

    return context;
}

```

<br/>

## 1. StartUp.create()

```java
static Startup create() {
    ClassLoader classLoader = Startup.class.getClassLoader();
    // JDK 레벨 crac 지원 확인
    return (ClassUtils.isPresent("jdk.crac.management.CRaCMXBean", classLoader)
            // 라이브러리 레벨 crac 지원 확인
            && ClassUtils.isPresent("org.crac.management.CRaCMXBean", classLoader))
            ? new CoordinatedRestoreAtCheckpointStartup() : new StandardStartup();
}
```

`CRaC가 뭔가?`
CRaC (Coordinated Restore at Checkpoint)

JVM을 특정 시점에 스냅샷(checkpoint) 으로 저장했다가 나중에 그 상태 그대로 복원(restore) 하는 기술로
JVM 콜드 스타트 시간 단축한다.

```
일반적인 JVM 시작:  [JVM 초기화] → [앱 초기화] → [Ready]  (수 초)

CRaC 복원 시작:      [스냅샷 로드] → [Ready]            (수십 ms)
```

일반적으로는 `StardardStartup()`으로 수행된다.

<br/>

## 2. DefaultBootstrapContext bootstrapContext = createBootstrapContext();

```java
private DefaultBootstrapContext createBootstrapContext() {
    // 빈 BootstrapContext 생성
    DefaultBootstrapContext bootstrapContext = new DefaultBootstrapContext();

    // initializer 순회하며 bootstrapContext 등록
    this.bootstrapRegistryInitializers.forEach((initializer) -> initializer.initialize(bootstrapContext));
    return bootstrapContext;
}
```

`BootstrapContext가 뭔가?`
> A simple bootstrap context that is available during startup and Environment post-processing up to the point that the
> ApplicationContext is prepared

실제 ApplicationContext가 준비되기 전에 startup 시에 만드는 임시 컨테이너이다.

- 외부 설정 로드 (ex. AWS Secrets Manager, Vault)
- 암호화 키 초기화
- 본 컨텍스트 생성 전에 필요한 리소스 준비

```java

@SpringBootApplication
public class SpringDojoApplication {

    public static void main(String[] args) {

        SpringApplication app = new SpringApplication(SpringDojoApplication.class);
        // App의 bootstrap registry에 추가하여 initialize를 익명함수로 작성하면 boot strap 컨테이너가 동작하는 것을 확인할 수 있다.
        app.addBootstrapRegistryInitializer(new BootstrapRegistryInitializer() {
            @Override
            public void initialize(BootstrapRegistry registry) {
                registry.register(BootstrapBean.class, BootstrapRegistry.InstanceSupplier.of(new BootstrapBean()));
            }
        });
        app.run(args);
    }

    private static class BootstrapBean {

        protected BootstrapBean() {
            System.out.println("BootstrapBean.class constructor");
        }
    }
}
```

디버거로 확인하면 null이던 것이 값이 들어오는것으로 확인할 수 있다.
![img.png](/images/0328/bootstrapBean.png)

<br/>

## 3. configureHeadlessProperty()

```java
// instance 변수
private boolean headless = true;

private void configureHeadlessProperty() {
    // 시스템 정보에서 Awt Headless를 로드한다.
    System.setProperty(SYSTEM_PROPERTY_JAVA_AWT_HEADLESS,
            System.getProperty(SYSTEM_PROPERTY_JAVA_AWT_HEADLESS,
                    Boolean.toString(this.headless)));
}
```

원래 Java AWT는 모니터/키보드/마우스 같은 **디스플레이 장치**가 있다고 가정한다고 한다. 서버 환경엔 당연히 없기 때문에 디스플레이 장치가 없는것을 JVM에
명시한다.(Headless = true)

<br/>

## 4. getRunListenter(args)

```java
SpringApplicationRunListeners listeners = getRunListeners(args);
listeners.

starting(bootstrapContext, this.mainApplicationClass);
```

default로 boot app을 구동했을때 debugger로 출력해보면 다음과 같은 listener만 등록되는것을 확인할 수 있다.
![img.png](/images/0328/runListener.png)

해당 SpringApplicationRunListener는 `package org.springframework.boot.context.event` 내에 포함되어 있고,
아래와 같은 동작을 수행한다.
> Called once the environment has been prepared, but before the {@link ApplicationContext} has been created.
> @param bootstrapContext the bootstrap context
> @param environment the environment

복잡하긴 하지만 천천히 코드 내부를 뜯어보면,

```java
public class EventPublishingRunListener implements SpringApplicationRunListener {

    @Override
    public void environmentPrepared(...) {
        // ApplicationEvent로 변환해서 발행
        multicastEvent(new ApplicationEnvironmentPreparedEvent(...));
    }

    @Override
    public void contextLoaded(...) {
        multicastEvent(new ApplicationPreparedEvent(...));
    }
}
```

run()이 수행되는 동안 각 단계별로 수행할때 외부로 listener broadcast를 진행한다.
Application Listener의 경우 log(slf4j), environment 후처리기.. 등이 있다고 한다.
직접 디버거로 확인해봤을 때는 9개의 listener가 되는 것을 확인할 수 있다.(refreshContext 이후 추가 됨) claude로 확인해보니 `prepareContext()` 단계에 listener로
등록된다고 한다.
`mainApplicationClass` 에 기본 설정된 listener이다.

![applicationRunnerDebugging.png](/images/0328/applicationRunner.png)

<br/>

## 5. new DefaultApplicationArguments(args)

> Default implementation of ApplicationArguments.

DefaultApplicationArguments는 ApplicationArgument이며
ApplicationArguemnt는 SpringApplication에서 넘겨받는 args에 접근을 제공한다. (쉽게 말해 Spring Application 구동에 활용되는 args에 접근하기 위해 사용됨)
> Provides access to the arguments that were used to run a SpringApplication.

program arguments로 --foo=bar를 넘기게 됐을때 디버거에는 아래와 같이 찍히는 모습을 확인할 수 있다.
![img.png](/images/0328/argsTest.png)

<br/>

## 6. prepareEnvironment(...)

```java
private ConfigurableEnvironment prepareEnvironment(SpringApplicationRunListeners listeners,
                                                   DefaultBootstrapContext bootstrapContext, ApplicationArguments applicationArguments) {
    // 1. Environment 생성
    ConfigurableEnvironment environment = getOrCreateEnvironment();

    // 2. 기본 설정 적용
    configureEnvironment(environment, applicationArguments.getSourceArgs());

    // 3. ConfigurationPropertySources 연결
    ConfigurationPropertySources.attach(environment);

    // 4. environmentPrepared 이벤트 발행
    listeners.environmentPrepared(bootstrapContext, environment);

    // 5. 특정 PropertySource들 순서 조정
    ApplicationInfoPropertySource.moveToEnd(environment);
    DefaultPropertiesPropertySource.moveToEnd(environment);

    // 6. 유효성 검사
    Assert.state(!environment.containsProperty("spring.main.environment-prefix"), ...);

    // 7. Environment → SpringApplication 바인딩
    bindToSpringApplication(environment);

    // 8. Environment 타입 변환 (필요 시)
    if (!this.isCustomEnvironment) {
        environment = environmentConverter.convertEnvironmentIfNecessary(...);
    }

    // 9. ConfigurationPropertySources 재연결
    ConfigurationPropertySources.attach(environment);

    return environment;
}
```

`config 우선순위`
[공식문서](https://docs.spring.io/spring-boot/reference/features/external-config.html) externalize configuration 우선순위를 확인할 수
있다.

우선순위

1. 기본 프로퍼티 — SpringApplication.setDefaultProperties(Map)으로 직접 지정한 값
2. @PropertySource — @Configuration 클래스에 선언한 어노테이션. 단, ApplicationContext refresh 시점에 로드되기 때문에 logging.*, spring.main.*
   같이 refresh 전에 읽히는 값에는 적용 안 됨
3. Config 데이터 — application.properties, application.yml 같은 설정 파일
4. RandomValuePropertySource — random.* 형태의 프로퍼티만 가짐 (ex. ${random.uuid})
5. OS 환경변수 — SERVER_PORT 같은 시스템 환경변수
6. Java 시스템 프로퍼티 — System.getProperties(), -Dserver.port=8080 같은 JVM 옵션
7. JNDI 속성 — java:comp/env 로부터 가져오는 값
8. ServletContext 초기화 파라미터
9. ServletConfig 초기화 파라미터
10. SPRING_APPLICATION_JSON — 환경변수나 시스템 프로퍼티에 인라인 JSON으로 넣은 값
11. 커맨드라인 인수 — --server.port=9090 같은 값
12. 테스트의 properties 속성 — @SpringBootTest 및 슬라이스 테스트 어노테이션에서 지정한 값
13. @DynamicPropertySource — 테스트에서 동적으로 등록하는 프로퍼티
14. @TestPropertySource — 테스트에서 정적으로 지정한 프로퍼티 파일
15. Devtools 글로벌 설정 — devtools 활성화 시 $HOME/.config/spring-boot 디렉토리의 설정값

<br/>

## 7. PrintBanner()

```java
private @Nullable Banner printBanner(ConfigurableEnvironment environment) {
    // Banner Mode 확인
    if (this.properties.getBannerMode(environment) == Banner.Mode.OFF) {
        return null;
    }
    // resource loader 선택
    ResourceLoader resourceLoader = (this.resourceLoader != null) ? this.resourceLoader
            : new DefaultResourceLoader(null);

    // 
    SpringApplicationBannerPrinter bannerPrinter = new SpringApplicationBannerPrinter(resourceLoader, this.banner);
    if (this.properties.getBannerMode(environment) == Mode.LOG) {
        return bannerPrinter.print(environment, this.mainApplicationClass, logger);
    }
    return bannerPrinter.print(environment, this.mainApplicationClass, System.out);
}
```

디버거로 확인하면 기본적으로 spring application banner를 사용하는것을 확인할 수 있다.
![spring app Banner](/images/0328/springAppBanner.png)

만약 banner를 끄고 싶다면 yaml로는 아래와 같이 할 수 있고

```yaml
spring:
  main:
    banner-mode: off  # 이때 null 반환
```

코드로는

```java
SpringApplication app = new SpringApplication(MyApp.class);
app.

setBannerMode(Banner.Mode.OFF);
```

커스텀을 하고싶다면 /resource 하위에 banner.txt를 생성하면
된다. [banner 생성기](https://patorjk.com/software/taag/#p=display&f=Acrobatic&t=Type+Something+&x=rainbow1&v=4&h=4&w=80&we=false)
를 활용하여
custom 할 수 있다.


<br/>

## 8. context = createApplicationContext()

> Strategy method used to create the ApplicationContext.
> By default this method will respect any explicitly set application context class or factory before falling back to a
> suitable default.
> return the application context (not yet refreshed)

Application Context를 생성하기 위한 전략 메서드로 사용된다.
ApplicationContextFactory가 webApplicationType에 따라 적절한 ApplicationContext 구현체를 생성한다.

```java
protected ConfigurableApplicationContext createApplicationContext() {
    // applicationType에 따라 context를 생성한다.
    ConfigurableApplicationContext context = this.applicationContextFactory
            .create(this.properties.getWebApplicationType());
    Assert.state(context != null, "ApplicationContextFactory created null context");
    return context;
}
```

| webApplicationType | 생성되는 구현체                                            |
|--------------------|-----------------------------------------------------|
| SERVLET            | AnnotationConfigServletWebServerApplicationContext  |
| REACTIVE           | AnnotationConfigReactiveWebServerApplicationContext |
| NONE               | AnnotationConfigApplicationContext                  |

WebApplicationType에 맞는 Context를 생성한다.

![application type debugger](/images/0328/applicationTypeContext.png)

기본으로 Servlet 타입으로 생성되는것을 확인할 수 있다.

<br/>

## 9. prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner)
> 

```java
private void prepareContext(DefaultBootstrapContext bootstrapContext,
                            ConfigurableApplicationContext context,
                            ConfigurableEnvironment environment,
                            SpringApplicationRunListeners listeners,
                            ApplicationArguments applicationArguments,
                            @Nullable Banner printedBanner) {

    // environment 연결
    context.setEnvironment(environment);
    // Context 후처리 (BeanNameGenerator, ResourceLoader, ConversionService 등)
    postProcessApplicationContext(context);
    // ApplicationContextInitializer 실행
    applyInitializers(context);
    // contextPrepared 이벤트 발행
    listeners.contextPrepared(context);
    // bootstrap context 컨테이너 종료    
    bootstrapContext.close(context);
    if (this.properties.isLogStartupInfo()) {
        logStartupInfo(context);
        logStartupProfileInfo(context);
    }
    // Add boot specific singleton beans
    ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
    beanFactory.registerSingleton("springApplicationArguments", applicationArguments);
    if (printedBanner != null) {
        beanFactory.registerSingleton("springBootBanner", printedBanner);
    }
    if (beanFactory instanceof AbstractAutowireCapableBeanFactory autowireCapableBeanFactory) {
        autowireCapableBeanFactory.setAllowCircularReferences(this.properties.isAllowCircularReferences());
        if (beanFactory instanceof DefaultListableBeanFactory listableBeanFactory) {
            listableBeanFactory.setAllowBeanDefinitionOverriding(this.properties.isAllowBeanDefinitionOverriding());
        }
    }
    if (this.properties.isLazyInitialization()) {
        context.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor());
    }
    if (this.properties.isKeepAlive()) {
        context.addApplicationListener(new KeepAlive());
    }
    context.addBeanFactoryPostProcessor(new PropertySourceOrderingBeanFactoryPostProcessor(context));
    if (!AotDetector.useGeneratedArtifacts()) {
        // Load the sources
        Set<Object> sources = getAllSources();
        Assert.state(!ObjectUtils.isEmpty(sources), "No sources defined");
        load(context, sources.toArray(new Object[0]));
    }
    listeners.contextLoaded(context);
}

protected void postProcessApplicationContext(ConfigurableApplicationContext context) {
    if (this.beanNameGenerator != null) {
        context.getBeanFactory()
                .registerSingleton(AnnotationConfigUtils.CONFIGURATION_BEAN_NAME_GENERATOR, this.beanNameGenerator);
    }
    if (this.resourceLoader != null) {
        if (context instanceof GenericApplicationContext genericApplicationContext) {
            genericApplicationContext.setResourceLoader(this.resourceLoader);
        }
        if (context instanceof DefaultResourceLoader defaultResourceLoader) {
            defaultResourceLoader.setClassLoader(this.resourceLoader.getClassLoader());
        }
    }
    if (this.addConversionService) {
        context.getBeanFactory().setConversionService(context.getEnvironment().getConversionService());
    }
}
```
`bootstrapContext.close(context)`의 경우 앞서 우리가 빠르게 bootstrap container를 통해 띄웠던 bean이나 listener를 이제 실제
application으로 옮겨서 실행하는 작업을 해야하기 때문에 bootstrapContext는 종료하게 된다.


(작성중)