# English Dictionary Extension 🔤

Chrome 브라우저에서 영어 단어의 뜻, 예문, 발음기호, 발음 재생을 즉시 확인할 수 있는 확장 프로그램입니다.

## 🌟 주요 기능

- **단어 드래그**: 궁금한 영어 단어를 드래그하면 즉시 사전 검색
- **마우스 호버**: 단어 위에 마우스를 올려두면 자동으로 의미 표시 (300ms 딜레이)
- **발음 기능**: 발음기호 표시 및 🔊 버튼으로 실제 발음 재생
- **상세 정보**: 품사별 의미, 예문, 동의어 제공
- **다크모드 지원**: 시스템 다크모드에 자동 대응
- **캐시 시스템**: 한 번 검색한 단어는 1시간 동안 캐시되어 빠른 재검색 가능

## 📱 지원 환경

- **브라우저**: Chrome, Edge, Brave 등 Chromium 기반 브라우저
- **웹사이트**: 모든 HTTP/HTTPS 웹사이트 및 PDF 파일
- **언어**: 영어 단어 (2글자 이상, 최대 50글자)

## 🚀 설치 방법

### 1. 개발자 모드로 설치 (권장)

1. **Chrome 브라우저 열기**
2. **확장 프로그램 관리 페이지 이동**:
   - 주소창에 `chrome://extensions/` 입력 또는
   - Chrome 메뉴 → 도구 더보기 → 확장 프로그램
3. **개발자 모드 활성화**: 우상단 토글 버튼 클릭
4. **압축해제된 확장 프로그램을 로드합니다** 클릭
5. **이 폴더 선택**: `english-dictionary-extension` 폴더 선택
6. **설치 완료**: 브라우저 툴바에 📖 아이콘 표시 확인

### 2. 패키징된 확장 프로그램 설치

```bash
# 프로젝트 루트에서 실행
cd english-dictionary-extension
zip -r english-dictionary-extension.zip * -x "*.git*" "node_modules/*" "*.md"
```

생성된 `.zip` 파일을 Chrome 확장 프로그램 페이지에 드래그&드롭하여 설치

## 📖 사용 방법

### 기본 사용법
1. **단어 드래그**: 웹페이지에서 영어 단어를 마우스로 드래그
2. **마우스 호버**: 단어 위에 마우스 커서를 300ms 이상 올려두기
3. **팝업 확인**: 단어의 의미, 발음기호, 예문이 팝업으로 표시
4. **발음 듣기**: 🔊 버튼 클릭으로 실제 발음 재생

### 팝업 제어
- **닫기**: ESC 키 또는 팝업 외부 영역 클릭
- **위치**: 마우스 위치에 따라 자동으로 팝업 위치 조정

### 확장 프로그램 팝업
- **툴바 아이콘 클릭**: 확장 프로그램 정보 및 단어 테스트 기능
- **단어 테스트**: 팝업에서 직접 단어를 입력하여 검색 가능

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **Chrome API**: Manifest V3, Content Scripts, Background Script
- **Dictionary API**: [Free Dictionary API](https://dictionaryapi.dev/)
- **아키텍처**: Event-driven, Message passing

## 📁 프로젝트 구조

```
english-dictionary-extension/
├── manifest.json           # 확장 프로그램 설정 파일
├── popup.html             # 확장 프로그램 팝업 페이지
├── icons/                 # 확장 프로그램 아이콘들
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/               # JavaScript 파일들
│   ├── content.js         # 웹페이지 스크립트 (UI 처리)
│   └── background.js      # 백그라운드 스크립트 (API 호출)
├── styles/                # 스타일시트
│   └── content.css        # 팝업 UI 스타일
└── README.md             # 프로젝트 문서
```

## ⚙️ 주요 컴포넌트

### Content Script (`scripts/content.js`)
- 웹페이지에서 단어 감지 및 사용자 이벤트 처리
- 팝업 UI 생성 및 위치 조정
- 사용자 상호작용 관리 (드래그, 호버, 키보드)

### Background Script (`scripts/background.js`)
- Dictionary API 호출 및 응답 처리
- 캐시 관리 (메모리 기반, 1시간 TTL)
- 에러 처리 및 재시도 로직

### Popup Interface (`popup.html`)
- 확장 프로그램 정보 표시
- 단어 테스트 기능
- 사용 가이드

## 🎨 UI/UX 특징

### 반응형 디자인
- 다양한 화면 크기에 적응
- 모바일 디바이스 지원

### 접근성
- 키보드 네비게이션 지원
- 고대비 모드 지원
- 다크모드 자동 감지

### 성능 최적화
- 디바운싱으로 불필요한 API 호출 방지
- 메모리 캐시로 빠른 재검색
- 경량화된 DOM 조작

## 🔧 커스터마이징

### CSS 스타일 수정
`styles/content.css` 파일을 편집하여 팝업 디자인 변경 가능

### API 변경
`scripts/background.js`의 `DICTIONARY_API_BASE_URL` 상수로 다른 사전 API 사용 가능

### 캐시 설정
`scripts/background.js`의 `CACHE_EXPIRY_TIME` 상수로 캐시 만료 시간 조정

## 🐛 문제 해결

### 확장 프로그램이 작동하지 않는 경우
1. **권한 확인**: 확장 프로그램이 현재 사이트에서 실행될 수 있는지 확인
2. **새로고침**: 페이지를 새로고침하거나 확장 프로그램 재로드
3. **콘솔 확인**: 개발자 도구(F12)에서 오류 메시지 확인
4. **네트워크**: 인터넷 연결 및 Dictionary API 접근 가능 여부 확인

### 단어를 인식하지 못하는 경우
- **영문자만 포함**: 숫자나 특수문자가 포함된 텍스트는 인식되지 않음
- **최소 길이**: 2글자 이상의 단어만 인식
- **최대 길이**: 50글자를 초과하는 텍스트는 인식되지 않음

### 발음이 재생되지 않는 경우
- **오디오 파일**: 일부 단어는 발음 파일이 제공되지 않을 수 있음
- **브라우저 정책**: 자동재생 정책으로 인해 수동 클릭이 필요할 수 있음

## 📋 개발 정보

### API 정보
- **Dictionary API**: https://api.dictionaryapi.dev/api/v2/entries/en/{word}
- **무료 사용**: 별도 인증 키 불필요
- **제한사항**: 분당 요청 수 제한 있음 (429 오류 시 재시도 필요)

### 브라우저 호환성
- **Chrome**: 88+ (Manifest V3 지원)
- **Edge**: 88+
- **Opera**: 74+
- **Brave**: 최신 버전

### 권한 설명
- `activeTab`: 현재 활성 탭에서 콘텐츠 스크립트 실행
- `storage`: 사용자 설정 저장 (향후 확장 기능용)
- `https://api.dictionaryapi.dev/*`: Dictionary API 접근

## 🤝 기여 방법

1. **이슈 보고**: 버그나 개선사항은 GitHub Issues로 보고
2. **기능 제안**: 새로운 기능 아이디어 제안
3. **코드 기여**: Pull Request를 통한 코드 개선
4. **번역**: 다국어 지원을 위한 번역 기여

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 🔗 관련 링크

- **Dictionary API**: https://dictionaryapi.dev/
- **Chrome Extension 개발 가이드**: https://developer.chrome.com/docs/extensions/
- **Manifest V3 문서**: https://developer.chrome.com/docs/extensions/mv3/

---

**개발자**: Claude AI Assistant  
**버전**: 1.0  
**마지막 업데이트**: 2024년 9월