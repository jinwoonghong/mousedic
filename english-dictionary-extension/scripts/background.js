// English Dictionary Extension - Background Script

// Dictionary API 설정
const DICTIONARY_API_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Translation API 설정
const TRANSLATION_API_BASE_URL = 'https://api.mymemory.translated.net/get';

// 캐시 저장소 (메모리 캐시)
const definitionCache = new Map();
const translationCache = new Map();
const CACHE_EXPIRY_TIME = 60 * 60 * 1000; // 1시간

class DictionaryService {
    constructor() {
        this.setupMessageListener();
        this.setupCacheCleanup();
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
                                synonyms: (def.synonyms || []).slice(0, 3)
                            }))
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

        // 번역 캐시 확인
        const cachedTranslation = this.getCachedTranslation(text);
        if (cachedTranslation) {
            return cachedTranslation;
        }

        try {
            const url = `${TRANSLATION_API_BASE_URL}?q=${encodeURIComponent(text)}&langpair=en|ko`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Translation API Error: ${response.status}`);
            }

            const data = await response.json();
            
            let translation = '';
            if (data.responseData && data.responseData.translatedText) {
                translation = data.responseData.translatedText;
            } else if (data.matches && data.matches.length > 0) {
                // 가장 좋은 매치 찾기
                const bestMatch = data.matches.find(match => 
                    match.translation && match.quality && 
                    (match.quality === 100 || match.quality > 70)
                ) || data.matches[0];
                
                if (bestMatch && bestMatch.translation) {
                    translation = bestMatch.translation;
                }
            }

            // 간단한 텍스트 정리
            translation = this.cleanKoreanTranslation(translation);
            
            // 캐시에 저장
            this.setCachedTranslation(text, translation);
            
            return translation || text; // 번역 실패시 원본 반환
            
        } catch (error) {
            console.error('Translation error:', error);
            return text; // 오류 시 원본 텍스트 반환
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