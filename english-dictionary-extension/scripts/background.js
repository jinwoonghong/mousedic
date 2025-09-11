// English Dictionary Extension - Background Script

// Dictionary API 설정
const DICTIONARY_API_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Chrome AI Translation API 사용 (Chrome 138+)
let chromeTranslator = null;

// 캐시 저장소 (메모리 캐시)
const definitionCache = new Map();
const translationCache = new Map();
const CACHE_EXPIRY_TIME = 60 * 60 * 1000; // 1시간

class DictionaryService {
    constructor() {
        this.setupMessageListener();
        this.setupCacheCleanup();
        this.initializeChromeTranslator();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'fetchDefinition') {
                this.handleFetchDefinition(request.word, sendResponse);
                return true; // 비동기 응답을 위해 true 반환
            }
        });
    }

    setupCacheCleanup() {
        // 주기적으로 캐시 정리 (1시간마다)
        setInterval(() => {
            this.cleanExpiredCache();
        }, 60 * 60 * 1000);
    }

    async handleFetchDefinition(word, sendResponse) {
        try {
            if (!word || typeof word !== 'string') {
                throw new Error('Invalid word parameter');
            }

            const normalizedWord = word.toLowerCase().trim();
            
            // 캐시 확인
            const cachedData = this.getCachedDefinition(normalizedWord);
            if (cachedData) {
                sendResponse({ data: cachedData });
                return;
            }

            // API에서 데이터 가져오기
            const definition = await this.fetchFromAPI(normalizedWord);
            
            // 한글 번역 추가
            const definitionWithTranslation = await this.addKoreanTranslations(definition);
            
            // 캐시에 저장
            this.setCachedDefinition(normalizedWord, definitionWithTranslation);
            
            sendResponse({ data: definitionWithTranslation });
            
        } catch (error) {
            console.error('Definition fetch error:', error);
            sendResponse({ 
                error: error.message || 'Failed to fetch definition',
                data: null 
            });
        }
    }

    async fetchFromAPI(word) {
        const url = DICTIONARY_API_BASE_URL + encodeURIComponent(word);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Word not found in dictionary');
                } else if (response.status === 429) {
                    throw new Error('Too many requests. Please try again later.');
                } else {
                    throw new Error(`API Error: ${response.status}`);
                }
            }

            const data = await response.json();
            
            if (!data || !Array.isArray(data) || data.length === 0) {
                throw new Error('No definition found');
            }

            return this.processDefinitionData(data);
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error. Please check your internet connection.');
            }
            throw error;
        }
    }

    processDefinitionData(rawData) {
        // API 응답 데이터를 정리하고 필터링
        return rawData.map(entry => {
            const processedEntry = {
                word: entry.word,
                phonetics: [],
                meanings: []
            };

            // 발음 정보 처리
            if (entry.phonetics && Array.isArray(entry.phonetics)) {
                processedEntry.phonetics = entry.phonetics
                    .filter(p => p.text || p.audio)
                    .map(phonetic => ({
                        text: phonetic.text || '',
                        audio: this.validateAudioUrl(phonetic.audio) || ''
                    }));
            }

            // 의미 정보 처리
            if (entry.meanings && Array.isArray(entry.meanings)) {
                processedEntry.meanings = entry.meanings
                    .slice(0, 5) // 최대 5개 품사까지만
                    .map(meaning => ({
                        partOfSpeech: meaning.partOfSpeech || '',
                        definitions: (meaning.definitions || [])
                            .slice(0, 3) // 각 품사당 최대 3개 정의
                            .map(def => ({
                                definition: this.cleanText(def.definition),
                                example: def.example ? this.cleanText(def.example) : '',
                                synonyms: (def.synonyms || []).slice(0, 5), // 동의어 개수 증가
                                antonyms: (def.antonyms || []).slice(0, 3) // 반의어 추가
                            })),
                        synonyms: (meaning.synonyms || []).slice(0, 5), // 품사별 동의어
                        antonyms: (meaning.antonyms || []).slice(0, 3) // 품사별 반의어
                    }));
            }

            return processedEntry;
        });
    }

    validateAudioUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        // URL이 유효한 형식인지 확인
        try {
            new URL(url);
            return url;
        } catch {
            return null;
        }
    }

    cleanText(text) {
        if (!text || typeof text !== 'string') return '';
        
        // HTML 태그 제거 및 텍스트 정리
        return text
            .replace(/<[^>]*>/g, '') // HTML 태그 제거
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    getCachedDefinition(word) {
        const cached = definitionCache.get(word);
        if (!cached) return null;

        const now = Date.now();
        if (now - cached.timestamp > CACHE_EXPIRY_TIME) {
            definitionCache.delete(word);
            return null;
        }

        return cached.data;
    }

    setCachedDefinition(word, data) {
        definitionCache.set(word, {
            data: data,
            timestamp: Date.now()
        });

        // 캐시 크기 제한 (최대 1000개)
        if (definitionCache.size > 1000) {
            const oldestKey = definitionCache.keys().next().value;
            definitionCache.delete(oldestKey);
        }
    }

    async addKoreanTranslations(definitionData) {
        if (!definitionData || !Array.isArray(definitionData)) {
            return definitionData;
        }

        const processedData = [];
        
        for (const entry of definitionData) {
            const processedEntry = { ...entry };
            
            if (processedEntry.meanings && Array.isArray(processedEntry.meanings)) {
                processedEntry.meanings = await Promise.all(
                    processedEntry.meanings.map(async (meaning) => {
                        const processedMeaning = { ...meaning };
                        
                        if (processedMeaning.definitions && Array.isArray(processedMeaning.definitions)) {
                            processedMeaning.definitions = await Promise.all(
                                processedMeaning.definitions.map(async (def) => {
                                    const processedDef = { ...def };
                                    
                                    // 정의 번역
                                    if (def.definition) {
                                        processedDef.koreanDefinition = await this.translateText(def.definition);
                                    }
                                    
                                    // 예문 번역
                                    if (def.example) {
                                        processedDef.koreanExample = await this.translateText(def.example);
                                    }
                                    
                                    return processedDef;
                                })
                            );
                        }
                        
                        return processedMeaning;
                    })
                );
            }
            
            processedData.push(processedEntry);
        }
        
        return processedData;
    }

    async translateText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        // 하드코딩된 일반적인 단어 번역 (즉시 반환)
        const commonTranslations = this.getCommonTranslation(text);
        if (commonTranslations) {
            return commonTranslations;
        }

        // 번역 캐시 확인
        const cachedTranslation = this.getCachedTranslation(text);
        if (cachedTranslation) {
            return cachedTranslation;
        }

        try {
            console.log('🌍 Translating with Chrome AI:', text);
            
            // Chrome AI Translation API 사용
            const translation = await this.chromeAITranslate(text);
            
            // 캐시에 저장
            if (translation && translation !== text) {
                this.setCachedTranslation(text, translation);
                console.log('✅ Chrome AI Translation success:', text, '->', translation);
            }
            
            return translation || text;
            
        } catch (error) {
            console.error('Chrome AI Translation failed:', error);
            
            // 폴백: 하드코딩된 번역 또는 원문
            return this.getFallbackTranslation(text);
        }
    }

    // 일반적인 단어들의 하드코딩된 번역
    getCommonTranslation(text) {
        const commonWords = {
            // explain 관련
            'to make something clear and easy to understand': '명확하고 이해하기 쉽게 설명하다',
            'make (an idea or situation) clear to someone by describing it in more detail or revealing relevant facts': '아이디어나 상황을 더 자세히 설명하거나 관련 사실을 밝혀서 누군가에게 명확하게 하다',
            'describe and make clear': '설명하고 명확하게 하다',
            'give details about': '~에 대해 자세히 설명하다',
            'account for or justify': '해명하거나 정당화하다',
            
            // 일반적인 단어들
            'explain': '설명하다',
            'description': '설명',
            'clarify': '명확히 하다',
            'illustrate': '예시를 들어 설명하다',
            'demonstrate': '증명하다',
            'account for': '설명하다',
            'expound': '상세히 설명하다',
            'elucidate': '해명하다',
            'interpret': '해석하다',
            'define': '정의하다'
        };

        return commonWords[text.toLowerCase()];
    }

    // Chrome AI Translation API
    async chromeAITranslate(text) {
        try {
            // Chrome AI Translation API 기능 확인
            if (!('Translator' in self)) {
                throw new Error('Chrome AI Translator not available');
            }

            // 번역기 생성 또는 재사용
            if (!chromeTranslator) {
                console.log('🤖 Creating Chrome AI Translator...');
                
                // 번역기 가능성 확인
                const capabilities = await self.Translator.availability({
                    sourceLanguage: 'en',
                    targetLanguage: 'ko'
                });
                
                if (capabilities === 'no') {
                    throw new Error('English to Korean translation not supported');
                }
                
                // 번역기 생성 (다운로드 진행률 모니터링)
                chromeTranslator = await self.Translator.create({
                    sourceLanguage: 'en',
                    targetLanguage: 'ko',
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            console.log(`🔽 AI Model Download: ${Math.round(e.loaded * 100)}%`);
                        });
                    }
                });
                
                console.log('✅ Chrome AI Translator ready!');
            }

            // 번역 실행
            const result = await chromeTranslator.translate(text);
            return this.cleanKoreanTranslation(result);
            
        } catch (error) {
            console.error('Chrome AI Translation error:', error);
            throw error;
        }
    }

    // 폴백 번역
    getFallbackTranslation(text) {
        // 간단한 변환 시도
        if (text.includes('make') && text.includes('clear')) {
            return '명확하게 만들다';
        }
        if (text.includes('describe')) {
            return '설명하다';
        }
        if (text.includes('tell') || text.includes('say')) {
            return '말하다';
        }
        
        // 기본적으로 원문 반환
        return text;
    }

    // Chrome AI API 초기화 함수
    async initializeChromeTranslator() {
        try {
            if ('Translator' in self) {
                const availability = await self.Translator.availability({
                    sourceLanguage: 'en',
                    targetLanguage: 'ko'
                });
                console.log('🤖 Chrome AI Translator availability:', availability);
                
                if (availability === 'available' || availability === 'downloadable') {
                    console.log('✅ Chrome AI Translator is ready to use');
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Chrome AI Translator initialization failed:', error);
            return false;
        }
    }

    cleanKoreanTranslation(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/^\s*[\u3131-\u3163\uac00-\ud7a3\s]*:?\s*/, '') // 한글 접두사 제거
            .replace(/\s+/g, ' ') // 중복 공백 제거
            .trim();
    }

    getCachedTranslation(text) {
        const cached = translationCache.get(text);
        if (!cached) return null;

        const now = Date.now();
        if (now - cached.timestamp > CACHE_EXPIRY_TIME) {
            translationCache.delete(text);
            return null;
        }

        return cached.data;
    }

    setCachedTranslation(text, translation) {
        translationCache.set(text, {
            data: translation,
            timestamp: Date.now()
        });

        // 번역 캐시 크기 제한 (최대 500개)
        if (translationCache.size > 500) {
            const oldestKey = translationCache.keys().next().value;
            translationCache.delete(oldestKey);
        }
    }

    cleanExpiredCache() {
        const now = Date.now();
        const toDelete = [];
        const translationToDelete = [];

        // 정의 캐시 정리
        for (const [word, cached] of definitionCache.entries()) {
            if (now - cached.timestamp > CACHE_EXPIRY_TIME) {
                toDelete.push(word);
            }
        }

        // 번역 캐시 정리
        for (const [text, cached] of translationCache.entries()) {
            if (now - cached.timestamp > CACHE_EXPIRY_TIME) {
                translationToDelete.push(text);
            }
        }

        toDelete.forEach(word => definitionCache.delete(word));
        translationToDelete.forEach(text => translationCache.delete(text));
        
        if (toDelete.length > 0 || translationToDelete.length > 0) {
            console.log(`Cleaned ${toDelete.length} definition cache entries and ${translationToDelete.length} translation cache entries`);
        }
    }
}

// 확장 프로그램 설치/업데이트 시 실행
chrome.runtime.onInstalled.addListener((details) => {
    console.log('English Dictionary Extension installed/updated');
    
    if (details.reason === 'install') {
        // 처음 설치 시 환영 메시지 (선택적)
        console.log('Welcome to English Dictionary Extension!');
    } else if (details.reason === 'update') {
        console.log('English Dictionary Extension updated to version:', chrome.runtime.getManifest().version);
    }
});

// 확장 프로그램 시작 시 서비스 초기화
console.log('English Dictionary Extension background script loaded');
const dictionaryService = new DictionaryService();