// English Dictionary Extension - Background Script

// Dictionary API 설정
const DICTIONARY_API_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// 캐시 저장소 (메모리 캐시)
const definitionCache = new Map();
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
            
            // 캐시에 저장
            this.setCachedDefinition(normalizedWord, definition);
            
            sendResponse({ data: definition });
            
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

    cleanExpiredCache() {
        const now = Date.now();
        const toDelete = [];

        for (const [word, cached] of definitionCache.entries()) {
            if (now - cached.timestamp > CACHE_EXPIRY_TIME) {
                toDelete.push(word);
            }
        }

        toDelete.forEach(word => definitionCache.delete(word));
        
        if (toDelete.length > 0) {
            console.log(`Cleaned ${toDelete.length} expired cache entries`);
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