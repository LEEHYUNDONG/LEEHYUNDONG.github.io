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

Security의 인증/인가 처리 시에 프레임워크 레벨에서 각기 어느 지점을 타고 동작하는지는 대략적으로 알아보며, Spring Boot App은 항상 사용하고 있지만,
어떤 방식으로 동작하는지, 어떤 과정을 거쳐 앱이 구동되는지 궁금해졌다.

이런 내용을 전부 다 외울 필요는 없겠지만 어떤 순서로 어느 시점에 내가 설정한 내용들이 bean이 만들어지는지 알아보자.

<br/>

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
```

`bootstrapContext.close(context)`의 경우 앞서 우리가 빠르게 bootstrap container를 통해 띄웠던 bean이나 listener를 이제 실제
application으로 옮겨서 실행하는 작업을 해야하기 때문에 bootstrapContext는 종료하게 된다.

`ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();` 를 통해 필요한 beanFactory 정보를 context로 부터 불러온다.
ConfigurableListableBeanFactory는 아래 ListableBeanFactory, AutowireCapableBeanFactory, ConfigurableBeanFactory를 상속하는
factory이며 더 상위는 BeanFactory이다.

```java
public interface ConfigurableListableBeanFactory extends ListableBeanFactory, AutowireCapableBeanFactory, ConfigurableBeanFactory {
}
```

> Configuration interface to be implemented by most listable bean factories. In addition to ConfigurableBeanFactory, it
> provides facilities to analyze and modify bean definitions, and to pre-instantiate singletons.
> This subinterface of org.springframework.beans.factory. BeanFactory is not meant to be used in normal application
> code:
> Stick to org. springframework. beans. factory. BeanFactory or ListableBeanFactory for typical use cases. This
> interface
> is just meant to allow for framework-internal plug'n'play even when needing access to bean factory configuration
> methods.

ConfigurableListableBeanFactory는 애플리케이션 코드 상 일반적인 사용을 위해서 제공되는것이 아니며 일반 사용이 목적이라면 `ListableBeanFactory`를 사용해야한다.
ConfigurableBeanFactory에 더해, 빈 정의를 분석·수정하고 싱글톤을 사전 인스턴스화(pre-instantiate)하는 기능을 추가로 제공한다.

이후 ConfigurableApplicationContext로부터 beanFactory를 꺼내어 아래 작업들을 수행한다.

1. applicationArguments singleton bean 등록 (beanFactory.registerSingleton)
2. printedBanner singleton bean 등록 (beanFactory.registerSingleton)
3. LazyInitializationBeanFactoryPostProcessor 생성하여 등록 (context.addBeanFactoryPostProcessor) — lazyInitialization 설정이
   활성화된 경우에만
4. context.addApplicationListener(new KeepAlive()) — KeepAlive 객체를 등록
5. PropertySourceOrderingBeanFactoryPostProcessor 생성하여 등록 (context.addBeanFactoryPostProcessor)

<br/>

## refreshContext(context)

![refreshContext.png](/images/0328/refreshContext.png)

```java
private void refreshContext(ConfigurableApplicationContext context) {
    if (this.properties.isRegisterShutdownHook()) {
        shutdownHook.registerApplicationContext(context);
    }
    refresh(context);
}

public class ServletWebServerApplicationContext extends GenericWebApplicationContext implements ConfigurableWebServerApplicationContext {
    public final void refresh() throws BeansException, IllegalStateException {
        try {
            super.refresh();
        } catch (RuntimeException var5) {
            RuntimeException ex = var5;
            WebServer webServer = this.webServer;
            if (webServer != null) {
                try {
                    webServer.stop();
                    webServer.destroy();
                } catch (RuntimeException var4) {
                    RuntimeException stopOrDestroyEx = var4;
                    ex.addSuppressed(stopOrDestroyEx);
                }
            }

            throw ex;
        }
    }
}
```

![hierarchy of](/images/0328/hierarchyOfWebServlet.png)

실제 `super.refresh();` 호출을 거슬러 올라가보면 AbstractApplicationContext가 호출되는것을 알 수 있다.

```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader
        implements ConfigurableApplicationContext {

    static {
        // Eagerly load the ContextClosedEvent class to avoid weird classloader issues
        // on application shutdown in WebLogic 8.1. (Reported by Dustin Woods.)
        ContextClosedEvent.class.getName();
    }

    @Override
    public void refresh() throws BeansException, IllegalStateException {
        this.startupShutdownLock.lock();
        try {
            this.startupShutdownThread = Thread.currentThread();

            // refresh()를 실행 중인 스레드를 기록.
            // 이후 refresh 중복 실행 방지 및 shutdown 시 해당 스레드 인터럽트에 사용됨
            StartupStep contextRefresh = this.applicationStartup.start("spring.context.refresh");

            // refresh 전 사전 준비 작업:
            // - active/closed 플래그 초기화
            // - PropertySource 초기화 (initPropertySources)
            // - Environment의 required properties 검증
            // - earlyApplicationListeners 초기화
            prepareRefresh();

            // Tell the subclass to refresh the internal bean factory.
            // 내부 BeanFactory를 준비하는 단계.
            // SpringBoot 기준 GenericApplicationContext는 이미 생성된 DefaultListableBeanFactory를 반환.
            // XML 기반 컨텍스트라면 이 시점에 XML을 파싱하여 BeanDefinition을 등록함
            ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

            // BeanFactory 자체에 대한 기본 설정을 적용하는 단계:
            // - ClassLoader 설정
            // - SpEL(Expression Language) 파서 등록
            // - PropertyEditorRegistrar 등록
            // - ApplicationContextAware 등록을 위한 BeanPostProcessor 추가
            // - BeanFactory, ApplicationContext 등 내부 의존성 타입을 autowiring 대상에서 제외
            // - environment, systemProperties 등 기본 singleton bean 등록
            prepareBeanFactory(beanFactory);

            try {
                // Allows post-processing of the bean factory in context subclasses.
                // 서브클래스에서 BeanFactory를 추가 커스터마이징할 수 있는 훅 메서드이다. 이 시점에 웹 관련 스코프(request, session)를 등록함
                postProcessBeanFactory(beanFactory);

                StartupStep beanPostProcess = this.applicationStartup.start("spring.context.beans.post-process");

                // Invoke factory processors registered as beans in the context.
                // BeanFactoryPostProcessor 및 BeanDefinitionRegistryPostProcessor 실행 단계.
                // 대표적으로 ConfigurationClassPostProcessor가 여기서 실행되어
                // @Configuration, @ComponentScan, @Bean 등을 처리하고 BeanDefinition을 등록함.
                // 즉, 이 시점에 대부분의 BeanDefinition 스캔/등록이 완료됨
                invokeBeanFactoryPostProcessors(beanFactory);

                // bean 생성을 가로채기 위해 사용되는 bean post processor 등록.
                // BeanPostProcessor는 bean 인스턴스 생성 전후에 개입하는 확장 포인트.
                // 대표적인 예:
                // - AutowiredAnnotationBeanPostProcessor (@Autowired, @Value 처리)
                // - CommonAnnotationBeanPostProcessor (@PostConstruct, @PreDestroy 처리)
                // 이 단계에서 등록만 하고, 실제 실행은 이후 bean 생성 시점에 이루어짐
                registerBeanPostProcessors(beanFactory);
                beanPostProcess.end();

                // message source 초기화.
                // MessageSource bean이 등록되어 있으면 해당 bean을 사용하고,
                // 없으면 기본 DelegatingMessageSource를 등록함.
                // 다국어(i18n) 메시지 처리를 담당함
                initMessageSource();

                // ApplicationEvent를 여러 ApplicationListener에게 멀티캐스트하는
                // ApplicationEventMulticaster를 초기화함.
                // 기본적으로 SimpleApplicationEventMulticaster가 등록됨
                initApplicationEventMulticaster();

                // 서브클래스 전용 특수 bean 초기화 훅 메서드.
                // 웹 환경에서는 이 시점에 EmbeddedWebServer(Tomcat 등)가 생성됨
                onRefresh();

                // Check for listener beans and register them.
                // BeanDefinition으로 등록된 ApplicationListener bean들을 찾아
                // ApplicationEventMulticaster에 등록함.
                // 또한 prepareRefresh()에서 보관해둔 earlyApplicationEvents를 이 시점에 발행함
                registerListeners();

                // lazy-init이 아닌 모든 singleton bean을 이 시점에 실제로 인스턴스화함.
                // @Autowired 주입, @PostConstruct 실행 등 bean 초기화 라이프사이클 전체가 여기서 진행됨.
                // 가장 무거운 단계
                finishBeanFactoryInitialization(beanFactory);

                // refresh 완료 후 마무리 작업:
                // - LifecycleProcessor 초기화 및 onRefresh() 호출
                // - ContextRefreshedEvent 발행
                // - 웹 환경이라면 WebServer 시작 및 ServerStartedEvent 발행
                finishRefresh();
            } catch (RuntimeException | Error ex) {
                // 불필요한 내용 중략

                // Destroy already created singletons to avoid dangling resources.
                destroyBeans();

                // active flag 활성화
                cancelRefresh(ex);

                // caller에게 예외 전파
                throw ex;
            } finally {
                contextRefresh.end();
            }
        } finally {
            this.startupShutdownThread = null;
            this.startupShutdownLock.unlock();
        }
    }
}
```

`refreshContext`의 경우 가장 중요한 메서드로 각 단계별로 내부 메서드를 확인해보려고 한다.

<br/>

### prepareRefresh()

```java
private @Nullable Set<ApplicationListener<?>> earlyApplicationListeners;

protected void prepareRefresh() {
    // 활성 상태로 전환한다
    this.startupDate = System.currentTimeMillis();
    this.closed.set(false);
    this.active.set(true);

    // logger가 확성화 되어 있다면 trace나 debug 모드로 로깅 처리
    if (logger.isDebugEnabled()) {
        if (logger.isTraceEnabled()) {
            logger.trace("Refreshing " + this);
        } else {
            logger.debug("Refreshing " + getDisplayName());
        }
    }

    // 실제로는 아무것도 하지 않음
    initPropertySources();

    // environment의 필수 property를 validate
    getEnvironment().validateRequiredProperties();

    // early application listener를 초기화한다.
    if (this.earlyApplicationListeners == null) {
        this.earlyApplicationListeners = new LinkedHashSet<>(this.applicationListeners);
    } else {
        // Reset local application listeners to pre-refresh state.
        this.applicationListeners.clear();
        this.applicationListeners.addAll(this.earlyApplicationListeners);
    }

    // 초기화 - 인스턴스 변수 earlyApplicationEvents
    this.earlyApplicationEvents = new LinkedHashSet<>();
}
```

<br/>

### registerBeanPostProcessors(beanFactory)

`registerBeanPostProcessors()` 과정에서 설정에 따라 다르겠지만 모든 beanName이 등록되는것을 확인할 수 있다.
![register bean](/images/0328/registerBean.png)

```java
/**
 * bean 초기화 및 등록
 */
protected void registerBeanPostProcessors(ConfigurableListableBeanFactory beanFactory) {
    PostProcessorRegistrationDelegate.registerBeanPostProcessors(beanFactory, this);
}

final class PostProcessorRegistrationDelegate {
    public static void registerBeanPostProcessors(
            ConfigurableListableBeanFactory beanFactory, AbstractApplicationContext applicationContext) {

        String[] postProcessorNames = beanFactory.getBeanNamesForType(BeanPostProcessor.class, true, false);

        int beanProcessorTargetCount = beanFactory.getBeanPostProcessorCount() + 1 + postProcessorNames.length;
        beanFactory.addBeanPostProcessor(
                new BeanPostProcessorChecker(beanFactory, postProcessorNames, beanProcessorTargetCount));

        List<BeanPostProcessor> priorityOrderedPostProcessors = new ArrayList<>();
        List<BeanPostProcessor> internalPostProcessors = new ArrayList<>();
        List<String> orderedPostProcessorNames = new ArrayList<>();
        List<String> nonOrderedPostProcessorNames = new ArrayList<>();
        for (String ppName : postProcessorNames) {
            if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
                BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
                priorityOrderedPostProcessors.add(pp);
                if (pp instanceof MergedBeanDefinitionPostProcessor) {
                    internalPostProcessors.add(pp);
                }
            } else if (beanFactory.isTypeMatch(ppName, Ordered.class)) {
                orderedPostProcessorNames.add(ppName);
            } else {
                nonOrderedPostProcessorNames.add(ppName);
            }
        }

        // PriorityOrdered bean 등록 
        sortPostProcessors(priorityOrderedPostProcessors, beanFactory);
        registerBeanPostProcessors(beanFactory, priorityOrderedPostProcessors);

        // @Order에 따른 bean 등록
        List<BeanPostProcessor> orderedPostProcessors = new ArrayList<>(orderedPostProcessorNames.size());
        for (String ppName : orderedPostProcessorNames) {
            BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
            orderedPostProcessors.add(pp);
            if (pp instanceof MergedBeanDefinitionPostProcessor) {
                internalPostProcessors.add(pp);
            }
        }
        // beanFactory 우선순위에 맞게 다시 sorting
        sortPostProcessors(orderedPostProcessors, beanFactory);
        registerBeanPostProcessors(beanFactory, orderedPostProcessors);

        // 일반 Bean 등록
        List<BeanPostProcessor> nonOrderedPostProcessors = new ArrayList<>(nonOrderedPostProcessorNames.size());
        for (String ppName : nonOrderedPostProcessorNames) {
            BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
            nonOrderedPostProcessors.add(pp);
            if (pp instanceof MergedBeanDefinitionPostProcessor) {
                internalPostProcessors.add(pp);
            }
        }
        registerBeanPostProcessors(beanFactory, nonOrderedPostProcessors);

        // internal beanProcessor 재등록
        sortPostProcessors(internalPostProcessors, beanFactory);
        registerBeanPostProcessors(beanFactory, internalPostProcessors);

        beanFactory.addBeanPostProcessor(new ApplicationListenerDetector(applicationContext));
    }

    // 내부 메서드
    private static void registerBeanPostProcessors(
            ConfigurableListableBeanFactory beanFactory, List<? extends BeanPostProcessor> postProcessors) {

        if (beanFactory instanceof AbstractBeanFactory abstractBeanFactory) {
            abstractBeanFactory.addBeanPostProcessors(postProcessors);
        } else {
            for (BeanPostProcessor postProcessor : postProcessors) {
                beanFactory.addBeanPostProcessor(postProcessor);
            }
        }
    }
}

```

아래와 같이 `registerBeanPostProcessors`는 동작한다.

1. PriorityOrdered 구현한 PostProcessor 먼저 등록
2. Ordered 구현한 PostProcessor 등록
3. 나머지 등록
4. Internal PostProcessor 재등록

<br/>

### initApplicationEventMulticaster()

```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader
        implements ConfigurableApplicationContext {
    public static final String APPLICATION_EVENT_MULTICASTER_BEAN_NAME = "applicationEventMulticaster";

    // application event multicaster 초기화
    protected void initApplicationEventMulticaster() {
        ConfigurableListableBeanFactory beanFactory = getBeanFactory();
        if (beanFactory.containsLocalBean(APPLICATION_EVENT_MULTICASTER_BEAN_NAME)) {
            this.applicationEventMulticaster =
                    beanFactory.getBean(APPLICATION_EVENT_MULTICASTER_BEAN_NAME, ApplicationEventMulticaster.class);
            if (logger.isTraceEnabled()) {
                logger.trace("Using ApplicationEventMulticaster [" + this.applicationEventMulticaster + "]");
            }
        } else {
            this.applicationEventMulticaster = new SimpleApplicationEventMulticaster(beanFactory);
            beanFactory.registerSingleton(APPLICATION_EVENT_MULTICASTER_BEAN_NAME, this.applicationEventMulticaster);
            if (logger.isTraceEnabled()) {
                logger.trace("No '" + APPLICATION_EVENT_MULTICASTER_BEAN_NAME + "' bean, using " +
                        "[" + this.applicationEventMulticaster.getClass().getSimpleName() + "]");
            }
        }
    }
}
```

사용자가 별도로 등록한 bean이 존재하지 않다면, default로 SimpleApplicationEventMulticaster가 생성되는 것을 알 수 있다.
만약 event 비동기 처리가 필요하다면 직접 custom을 아래와 같이 진행해볼 수 있을거 같다.

```java
public class SimpleApplicationEventMulticaster extends AbstractApplicationEventMulticaster {
    ...

    public void setTaskExecutor(@Nullable Executor taskExecutor) {
        this.taskExecutor = taskExecutor;
    }
}

@Bean
public ApplicationEventMulticaster applicationEventMulticaster() {
    SimpleApplicationEventMulticaster multicaster = new SimpleApplicationEventMulticaster();

    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(10);
    executor.initialize();

    multicaster.setTaskExecutor(executor); // 비동기 처리
    return multicaster;
}
```

<br/>

### onRefresh()

> Template method which can be overridden to add context-specific refresh work. Called on initialization of special
> beans, before instantiation of singletons. This implementation is empty. throws BeansException in case of errors

템플릿 메서드로 AbstractApplicationContext의 기본 구현은 비어 있지만, 웹 애플리케이션 환경에서는 ServletWebServerApplicationContext가 이를 오버라이드해서 중요한 작업을 수행한다.

```java
protected void onRefresh() throws BeansException {
    // For subclasses: do nothing by default.
}
```

쉽게 말하면, **웹 환경에서 내장 톰캣이 생성되는 시점**이 바로 여기다.
`ServletWebServerApplicationContext`의 `onRefresh()`를 보면 `createWebServer()`를 호출해서 톰캣 인스턴스를 생성한다.
하지만 이 시점에는 아직 톰캣을 시작하지는 않는다. 톰캣 자체는 생성되지만 포트를 열거나 요청을 받을 준비는 `finishRefresh()`에서 이루어진다.

따라서 정리하면:
- **onRefresh()** → 톰캣 인스턴스 생성
- **finishRefresh()** → 톰캣 시작 (포트 개방)

### registerListeners()

```java
protected void registerListeners() {
    // mutlicaster에 listener 등록
    for (ApplicationListener<?> listener : getApplicationListeners()) {
        getApplicationEventMulticaster().addApplicationListener(listener);
    }

    // 기본적으로 6개의 application listener bean name이 있다.
    // 실제 인스턴스화를 진행하는 것이 아니라 beanName만 등록한다.
    String[] listenerBeanNames = getBeanNamesForType(ApplicationListener.class, true, false);
    for (String listenerBeanName : listenerBeanNames) {
        getApplicationEventMulticaster().addApplicationListenerBean(listenerBeanName);
    }

    // 한번에 발행
    Set<ApplicationEvent> earlyEventsToProcess = this.earlyApplicationEvents;
    this.earlyApplicationEvents = null;
    if (!CollectionUtils.isEmpty(earlyEventsToProcess)) {
        for (ApplicationEvent earlyEvent : earlyEventsToProcess) {
            getApplicationEventMulticaster().multicastEvent(earlyEvent);
        }
    }
}
```

![application listener](/images/0328/applicationListener.png)

디버거에서 확인해보면 기본적으로 이미 인스턴스화된 12개의 listener를 등록하며 반복문을 순회하며 ApplicationListener를 Multicaster에 등록한다.
하단에 Bean Name을 추출하는 부분은 `addApplicationListenerBean(listenerBeanName)` 으로 동작하며 초기화를 해당 메서드 실행시에 진행하는 것이 아닌
실제 인스턴스화는 `finishBeanFactoryInitialization()`에서 이루어진다.

`earlyApplicationEvents`는 **multicaster가 아직 준비되지 않은 시점에 발행된 이벤트들을 임시 보관하는 버퍼**이다.
`registerListeners()`에서 multicaster가 준비된 시점에 한꺼번에 발행한다.

`listenerBeanNames`

1. org.springframework.boot.autoconfigure.internalCachingMetadataReaderFactory
2. applicationTaskExecutor
3. mvcResourceUrlProvider
4. springApplicationAdminRegistrar
5. applicationAvailability
6. restartingClassPathChangedEventListener
7. conditionEvaluationDeltaLoggingListener

**왜 이렇게 동작할까?**
addApplicationListener(listener)

prepareContext()에서 context.addApplicationListener(new KeepAlive()) 처럼 이미 new로 직접 생성된 인스턴스가 있으니까 바로 등록 가능하다.

addApplicationListenerBean(beanName)의 경우 @Component로 등록된 리스너처럼 아직 인스턴스가 없고 BeanDefinition만 존재한다.
따라서 이름만 예약해두고 finishBeanFactoryInitialization()에서 인스턴스화될 때 실제 등록이 가능하다.


<br/>

### finishBeanFactoryInitialization(beanFactory)

```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader
        implements ConfigurableApplicationContext {


    protected void finishBeanFactoryInitialization(ConfigurableListableBeanFactory beanFactory) {
        // Mark current thread for singleton instantiation with applied bootstrap locking.
        beanFactory.prepareSingletonBootstrap();

        // Initialize bootstrap executor for this context.
        if (beanFactory.containsBean(BOOTSTRAP_EXECUTOR_BEAN_NAME) &&
                beanFactory.isTypeMatch(BOOTSTRAP_EXECUTOR_BEAN_NAME, Executor.class)) {
            beanFactory.setBootstrapExecutor(
                    beanFactory.getBean(BOOTSTRAP_EXECUTOR_BEAN_NAME, Executor.class));
        }

        // Initialize conversion service for this context.
        if (beanFactory.containsBean(CONVERSION_SERVICE_BEAN_NAME) &&
                beanFactory.isTypeMatch(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class)) {
            beanFactory.setConversionService(
                    beanFactory.getBean(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class));
        }

        // Register a default embedded value resolver if no BeanFactoryPostProcessor
        // (such as a PropertySourcesPlaceholderConfigurer bean) registered any before:
        // at this point, primarily for resolution in annotation attribute values.
        if (!beanFactory.hasEmbeddedValueResolver()) {
            beanFactory.addEmbeddedValueResolver(strVal -> getEnvironment().resolvePlaceholders(strVal));
        }

        // Call BeanFactoryInitializer beans early to allow for initializing specific other beans early.
        String[] initializerNames = beanFactory.getBeanNamesForType(BeanFactoryInitializer.class, false, false);
        for (String initializerName : initializerNames) {
            beanFactory.getBean(initializerName, BeanFactoryInitializer.class).initialize(beanFactory);
        }

        // Initialize LoadTimeWeaverAware beans early to allow for registering their transformers early.
        String[] weaverAwareNames = beanFactory.getBeanNamesForType(LoadTimeWeaverAware.class, false, false);
        for (String weaverAwareName : weaverAwareNames) {
            try {
                beanFactory.getBean(weaverAwareName, LoadTimeWeaverAware.class);
            } catch (BeanNotOfRequiredTypeException ex) {
                if (logger.isDebugEnabled()) {
                    logger.debug("Failed to initialize LoadTimeWeaverAware bean '" + weaverAwareName +
                            "' due to unexpected type mismatch: " + ex.getMessage());
                }
            }
        }

        // Stop using the temporary ClassLoader for type matching.
        beanFactory.setTempClassLoader(null);

        // Allow for caching all bean definition metadata, not expecting further changes.
        beanFactory.freezeConfiguration();

        // Instantiate all remaining (non-lazy-init) singletons.
        beanFactory.preInstantiateSingletons();
    }
}
```

`finishBeanFactoryInitialization`은 refresh 과정에서 **가장 무겁고 가장 중요한 단계**다.

주요 동작을 순서대로 살펴보면:

1. **prepareSingletonBootstrap()** - 싱글톤 인스턴스화를 시작하기 위해 현재 스레드를 마킹
2. **setBootstrapExecutor()** - Bean 초기화를 병렬로 처리할 Executor가 있다면 설정 (선택사항)
3. **setConversionService()** - 타입 변환을 담당하는 ConversionService 설정
4. **addEmbeddedValueResolver()** - `${property.name}` 같은 placeholder를 해석하기 위한 resolver 등록
5. **BeanFactoryInitializer 실행** - Bean 생성 전에 특정 초기화 작업이 필요한 Bean들 실행
6. **LoadTimeWeaverAware 초기화** - AOP를 위한 클래스 로딩 시점 바이트코드 위빙 설정
7. **freezeConfiguration()** - 더 이상 BeanDefinition이 추가되거나 변경되지 않도록 고정
8. **preInstantiateSingletons()** - 모든 싱글톤 Bean의 실제 인스턴스화 시작!

특히 `preInstantiateSingletons()`에서는 정말 많은 일이 일어난다:
- lazy-init이 아닌 모든 싱글톤 Bean을 메모리에 생성
- 각 Bean의 생성자 호출
- @Autowired, @Value로 의존성 주입
- 이전에 `registerListeners()`에서 beanName으로만 예약해둔 ApplicationListener Bean들도 이 시점에 인스턴스화됨
- @PostConstruct 메서드 실행
- BeanPostProcessor들이 각 Bean에 개입하여 추가 처리

결국 우리가 작성한 @Service, @Repository, @Component, @Configuration 등으로 선언한 모든 Bean이 이 단계에서 생성되고 초기화되는 것이다.

<br/>

### finishRefresh()

```java
protected void finishRefresh() {
    // Clear context-level resource caches (such as ASM metadata from scanning).
    clearResourceCaches();

    // Initialize lifecycle processor for this context.
    initLifecycleProcessor();

    // Propagate refresh to lifecycle processor first.
    getLifecycleProcessor().onRefresh();

    // Publish the final event.
    publishEvent(new ContextRefreshedEvent(this));

    // Participate in LiveBeansView MBean, if active.
    if (!NativeDetector.inNativeImage()) {
        LiveBeansView.registerApplicationContext(this);
    }
}
```

refresh의 마무리 단계이다.

1. **clearResourceCaches()** - ASM 메타데이터 같은 임시 캐시 정리
2. **initLifecycleProcessor()** - Lifecycle 관리를 담당하는 프로세서 초기화
3. **getLifecycleProcessor().onRefresh()** - Lifecycle Bean들에게 refresh 완료를 알림
4. **publishEvent(new ContextRefreshedEvent(this))** - Context 준비 완료 이벤트 발행
5. **LiveBeansView.registerApplicationContext()** - JMX를 통한 Bean 모니터링 등록

여기서 발행되는 `ContextRefreshedEvent`는 ApplicationContext가 완전히 초기화되었음을 알리는 중요한 이벤트다.
이 시점부터는 모든 Bean이 준비되어 있으므로, 이벤트 리스너에서 안전하게 모든 Bean에 접근할 수 있다.

웹 애플리케이션의 경우를 생각해보면, 여기서 중요한 일이 하나 더 일어난다.
`ServletWebServerApplicationContext`의 `finishRefresh()`는 부모 클래스의 `finishRefresh()`를 호출한 후, **이전에 onRefresh()에서 생성된 내장 톰캣 인스턴스를 실제로 시작**한다.
즉, 포트를 열고 요청을 받을 준비를 하는 단계다.

따라서 우리의 애플리케이션이 HTTP 요청을 받을 수 있게 되는 시점이 바로 여기라고 봐도 된다.

<br/>

## 11. afterRefresh(context, applicationArguments)

```java
protected void afterRefresh(ConfigurableApplicationContext context, ApplicationArguments args) {
    // For subclasses: do nothing by default.
}
```

템플릿 메서드로, 기본 구현은 비어있다.
필요하다면 SpringApplication을 상속해서 refresh 이후 추가 작업을 수행할 수 있는 확장 포인트이다.

<br/>

## 12. startup.ready()

```java
startup.ready();
```

애플리케이션 구동 시간을 측정하고 준비 완료 상태로 전환한다.
CRaC를 사용하는 경우 복원 시점을 기록하고, 일반적인 경우 시작 시간을 기록한다.

<br/>

## 13. listeners.started(context, startup.timeTakenToStarted())

```java
listeners.started(context, startup.timeTakenToStarted());
```

모든 RunListener들에게 started 이벤트를 발행한다.
이때 `ApplicationStartedEvent`가 발행되며, 이 시점부터는 ApplicationContext가 완전히 준비되었고 CommandLineRunner/ApplicationRunner 실행 직전이다.

<br/>

## 14. callRunners(context, applicationArguments)

```java
private void callRunners(ApplicationContext context, ApplicationArguments args) {
    context.getBeanProvider(Runner.class)
            .orderedStream()
            .forEach((runner) -> {
                if (runner instanceof ApplicationRunner) {
                    callRunner((ApplicationRunner) runner, args);
                }
                if (runner instanceof CommandLineRunner) {
                    callRunner((CommandLineRunner) runner, args);
                }
            });
}
```

마지막으로 `ApplicationRunner`와 `CommandLineRunner` Bean들을 실행한다.

**ApplicationRunner vs CommandLineRunner**

둘 다 애플리케이션 시작 직후 특정 코드를 실행하기 위한 인터페이스이지만 차이가 있다:

```java
@Component
public class MyApplicationRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) throws Exception {
        // ApplicationArguments로 args 접근 (--key=value 형태 파싱 지원)
        if (args.containsOption("debug")) {
            System.out.println("Debug mode enabled");
        }
    }
}

@Component
public class MyCommandLineRunner implements CommandLineRunner {
    @Override
    public void run(String... args) throws Exception {
        // 원본 String 배열 그대로 전달받음
        System.out.println("App started with " + args.length + " arguments");
    }
}
```

실행 순서는 `@Order` 어노테이션으로 제어할 수 있다.

이 단계는 초기 데이터 로딩, 캐시 워밍업, 외부 시스템 연결 확인 등 애플리케이션 시작 직후 수행해야 하는 작업에 활용된다.

<br/>

## 15. listeners.ready(context, startup.ready())

```java
listeners.ready(context, startup.ready());
```

모든 과정이 완료되었음을 알리는 최종 이벤트를 발행한다.
`ApplicationReadyEvent`가 발행되며, 이제 애플리케이션은 완전히 준비되어 요청을 처리할 수 있는 상태가 된다.

웹 애플리케이션의 경우 이 시점부터 HTTP 요청을 받을 수 있다.

<br/>

# 정리

SpringApplication.run()을 호출하면 다음과 같은 복잡한 과정을 거쳐 애플리케이션이 구동된다:

**준비 단계**
1. CRaC 환경 확인 및 시작 시간 기록
2. BootstrapContext 초기화 (외부 설정 등)
3. Headless 모드 설정

**환경 구성**
4. RunListener 준비 및 starting 이벤트
5. 커맨드라인 인자 파싱
6. Environment 준비 (application.yml 로드 등)
7. Banner 출력

**Context 생성 및 준비**
8. ApplicationContext 생성 (웹 타입에 따라)
9. prepareContext - BeanDefinition 로드, Initializer 실행

**핵심 초기화 (refreshContext)**
10. Bean 생성 및 의존성 주입
    - BeanFactoryPostProcessor 실행 (@Configuration 처리)
    - BeanPostProcessor 등록
    - ApplicationEventMulticaster 초기화
    - 모든 싱글톤 Bean 인스턴스화
    - 내장 톰캣 시작 (웹 앱)

**완료**
11. afterRefresh 훅
12. startup ready 기록
13. started 이벤트 발행
14. ApplicationRunner/CommandLineRunner 실행
15. ready 이벤트 발행 → 애플리케이션 준비 완료!

특히 `refreshContext` 단계가 가장 핵심적이고 무거운 작업으로, 여기서 우리가 작성한 모든 Bean이 생성되고 의존성이 주입되며 웹 서버가 시작된다.

이런 내부 동작을 이해하면 Spring Boot의 자동 설정이 어느 시점에 동작하는지, 내가 만든 Bean이 언제 초기화되는지, 그리고 문제가 생겼을 때 어느 단계에서 발생한 것인지 파악하는 데 큰 도움이 된다.

물론 이 모든 내용을 외울 필요는 없지만, 필요할 때 다시 찾아볼 수 있도록 전체적인 흐름은 기억해두면 좋을 것 같다.

