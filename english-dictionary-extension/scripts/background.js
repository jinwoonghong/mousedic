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
        console.log('📚 Offline Dictionary Service initialized');
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

    // 완전한 오프라인 한영 사전
    getCommonTranslation(text) {
        const offlineDictionary = {
            // explain 관련 정의들
            'to make something clear and easy to understand': '무언가를 명확하고 이해하기 쉽게 만들다',
            'make (an idea or situation) clear to someone by describing it in more detail or revealing relevant facts': '더 자세히 설명하거나 관련 사실을 밝혀서 누군가에게 (아이디어나 상황을) 명확하게 하다',
            'describe and make clear': '설명하고 명확하게 하다',
            'give details about': '~에 대해 자세히 설명하다',
            'account for or justify': '해명하거나 정당화하다',
            'make something clear by describing it in more detail': '더 자세히 설명해서 무언가를 명확하게 하다',
            
            // elaborate 관련
            'develop or present (a theory, policy, or system) in detail': '(이론, 정책, 시스템을) 자세히 발전시키거나 제시하다',
            'add more detail concerning what has already been said': '이미 말한 것에 대해 더 자세한 내용을 추가하다',
            'involving many carefully arranged parts or details': '주의 깊게 배열된 많은 부분이나 세부사항을 포함하는',
            'worked out with great care and detail': '매우 신중하고 세밀하게 만들어진',
            
            // A로 시작하는 단어들
            'about': '~에 대해',
            'above': '~위에',
            'accept': '받아들이다',
            'account': '계정, 설명하다',
            'account for': '설명하다',
            'achieve': '달성하다',
            'across': '~를 가로질러',
            'action': '행동',
            'active': '활발한',
            'activity': '활동',
            'actually': '실제로',
            'add': '더하다',
            'address': '주소, 다루다',
            'administration': '행정',
            'admit': '인정하다',
            'adult': '성인',
            'affect': '영향을 주다',
            'after': '~후에',
            'again': '다시',
            'against': '~에 반대하여',
            'age': '나이',
            'agency': '기관',
            'agent': '대리인',
            'ago': '전에',
            'agree': '동의하다',
            'agreement': '협정',
            'ahead': '앞에',
            'air': '공기',
            'all': '모든',
            'allow': '허용하다',
            'almost': '거의',
            'alone': '혼자',
            'along': '~를 따라',
            'already': '이미',
            'also': '또한',
            'although': '비록 ~이지만',
            'always': '항상',
            'among': '~사이에',
            'amount': '양',
            'analysis': '분석',
            'and': '그리고',
            'animal': '동물',
            'another': '다른',
            'answer': '답',
            'any': '어떤',
            'anyone': '누구든지',
            'anything': '무엇이든',
            'appear': '나타나다',
            'apply': '적용하다',
            'approach': '접근하다',
            'area': '지역',
            'argue': '논쟁하다',
            'arm': '팔',
            'around': '주위에',
            'arrive': '도착하다',
            'art': '예술',
            'article': '기사',
            'artist': '예술가',
            'as': '~로서',
            'ask': '묻다',
            'assume': '가정하다',
            'at': '~에서',
            'attack': '공격하다',
            'attempt': '시도하다',
            'attend': '참석하다',
            'attention': '주의',
            'attitude': '태도',
            'attract': '끌어당기다',
            'available': '이용 가능한',
            'avoid': '피하다',
            'away': '떨어져',
            
            // B로 시작하는 단어들  
            'baby': '아기',
            'back': '뒤',
            'bad': '나쁜',
            'bag': '가방',
            'ball': '공',
            'bank': '은행',
            'bar': '바, 술집',
            'base': '기초',
            'be': '~이다',
            'beat': '치다',
            'beautiful': '아름다운',
            'because': '왜냐하면',
            'become': '되다',
            'bed': '침대',
            'before': '~전에',
            'begin': '시작하다',
            'behavior': '행동',
            'behind': '~뒤에',
            'believe': '믿다',
            'benefit': '이익',
            'best': '최고의',
            'better': '더 좋은',
            'between': '~사이에',
            'beyond': '~너머에',
            'big': '큰',
            'bill': '청구서',
            'billion': '10억',
            'bit': '조금',
            'black': '검은',
            'blood': '피',
            'blue': '파란',
            'board': '게시판',
            'body': '몸',
            'book': '책',
            'born': '태어난',
            'both': '둘 다',
            'box': '상자',
            'boy': '소년',
            'break': '부러뜨리다',
            'bring': '가져오다',
            'brother': '형제',
            'build': '짓다',
            'building': '건물',
            'business': '사업',
            'but': '하지만',
            'buy': '사다',
            'by': '~에 의해',
            
            // C로 시작하는 단어들
            'call': '부르다',
            'camera': '카메라',
            'campaign': '캠페인',
            'can': '할 수 있다',
            'candidate': '후보자',
            'capital': '수도',
            'car': '자동차',
            'card': '카드',
            'care': '돌보다',
            'career': '경력',
            'carry': '나르다',
            'case': '경우',
            'catch': '잡다',
            'cause': '원인',
            'cell': '세포',
            'center': '중심',
            'central': '중앙의',
            'century': '세기',
            'certain': '확실한',
            'certainly': '확실히',
            'chair': '의자',
            'challenge': '도전',
            'chance': '기회',
            'change': '변화',
            'character': '인물',
            'charge': '요금',
            'check': '확인하다',
            'child': '아이',
            'choice': '선택',
            'choose': '선택하다',
            'church': '교회',
            'citizen': '시민',
            'city': '도시',
            'civil': '시민의',
            'claim': '주장하다',
            'class': '수업',
            'clear': '명확한',
            'clearly': '명확히',
            'close': '가까운',
            'coach': '코치',
            'cold': '차가운',
            'collection': '수집',
            'college': '대학',
            'color': '색깔',
            'come': '오다',
            'commercial': '상업적인',
            'common': '일반적인',
            'community': '공동체',
            'company': '회사',
            'compare': '비교하다',
            'computer': '컴퓨터',
            'concern': '걱정',
            'condition': '조건',
            'conference': '회의',
            'congress': '의회',
            'consider': '고려하다',
            'consumer': '소비자',
            'contain': '포함하다',
            'continue': '계속하다',
            'control': '통제하다',
            'cost': '비용',
            'could': '할 수 있었다',
            'country': '국가',
            'couple': '부부',
            'course': '과정',
            'court': '법원',
            'cover': '덮다',
            'create': '만들다',
            'crime': '범죄',
            'cultural': '문화적인',
            'culture': '문화',
            'cup': '컵',
            'current': '현재의',
            'customer': '고객',
            'cut': '자르다',
            
            // D로 시작하는 단어들
            'dark': '어두운',
            'data': '데이터',
            'date': '날짜',
            'daughter': '딸',
            'day': '날',
            'dead': '죽은',
            'deal': '거래',
            'death': '죽음',
            'debate': '토론',
            'decade': '10년',
            'decide': '결정하다',
            'decision': '결정',
            'defense': '방어',
            'degree': '정도',
            'democratic': '민주적인',
            'describe': '묘사하다',
            'design': '디자인',
            'despite': '~에도 불구하고',
            'detail': '세부사항',
            'determine': '결정하다',
            'develop': '발전시키다',
            'development': '발전',
            'die': '죽다',
            'difference': '차이',
            'different': '다른',
            'difficult': '어려운',
            'dinner': '저녁식사',
            'direction': '방향',
            'director': '감독',
            'discover': '발견하다',
            'discuss': '토론하다',
            'discussion': '토론',
            'disease': '질병',
            'do': '하다',
            'doctor': '의사',
            'dog': '개',
            'door': '문',
            'down': '아래로',
            'draw': '그리다',
            'dream': '꿈',
            'drive': '운전하다',
            'drop': '떨어뜨리다',
            'drug': '약',
            'during': '~동안',
            
            // E로 시작하는 단어들
            'each': '각각의',
            'early': '이른',
            'east': '동쪽',
            'easy': '쉬운',
            'eat': '먹다',
            'economic': '경제적인',
            'economy': '경제',
            'edge': '가장자리',
            'education': '교육',
            'effect': '효과',
            'effort': '노력',
            'eight': '8',
            'either': '어느 쪽이든',
            'election': '선거',
            'else': '다른',
            'employee': '직원',
            'end': '끝',
            'energy': '에너지',
            'enjoy': '즐기다',
            'enough': '충분한',
            'enter': '들어가다',
            'entire': '전체의',
            'environment': '환경',
            'especially': '특히',
            'establish': '설립하다',
            'even': '심지어',
            'evening': '저녁',
            'event': '행사',
            'ever': '언제든지',
            'every': '모든',
            'everyone': '모든 사람',
            'everything': '모든 것',
            'evidence': '증거',
            'exactly': '정확히',
            'example': '예',
            'executive': '임원',
            'exist': '존재하다',
            'expect': '기대하다',
            'experience': '경험',
            'expert': '전문가',
            'explain': '설명하다',
            'eye': '눈',
            
            // F로 시작하는 단어들
            'face': '얼굴',
            'fact': '사실',
            'factor': '요인',
            'fail': '실패하다',
            'fall': '떨어지다',
            'family': '가족',
            'far': '멀리',
            'fast': '빠른',
            'father': '아버지',
            'fear': '두려움',
            'federal': '연방의',
            'feel': '느끼다',
            'feeling': '감정',
            'few': '적은',
            'field': '분야',
            'fight': '싸우다',
            'figure': '수치',
            'fill': '채우다',
            'film': '영화',
            'final': '최종의',
            'finally': '마침내',
            'financial': '재정적인',
            'find': '찾다',
            'fine': '괜찮은',
            'finger': '손가락',
            'finish': '끝내다',
            'fire': '불',
            'firm': '회사',
            'first': '첫 번째',
            'fish': '물고기',
            'five': '5',
            'floor': '바닥',
            'fly': '날다',
            'focus': '집중하다',
            'follow': '따라가다',
            'food': '음식',
            'foot': '발',
            'for': '~를 위해',
            'force': '힘',
            'foreign': '외국의',
            'forget': '잊다',
            'form': '형태',
            'former': '이전의',
            'forward': '앞으로',
            'four': '4',
            'free': '자유로운',
            'friend': '친구',
            'from': '~로부터',
            'front': '앞',
            'full': '가득한',
            'fund': '기금',
            'future': '미래',
            
            // G로 시작하는 단어들
            'game': '게임',
            'garden': '정원',
            'gas': '가스',
            'general': '일반적인',
            'generation': '세대',
            'get': '얻다',
            'girl': '소녀',
            'give': '주다',
            'glass': '유리',
            'go': '가다',
            'goal': '목표',
            'good': '좋은',
            'government': '정부',
            'great': '훌륭한',
            'green': '초록색',
            'ground': '땅',
            'group': '그룹',
            'grow': '자라다',
            'growth': '성장',
            'guess': '추측하다',
            'gun': '총',
            'guy': '남자',
            
            // H로 시작하는 단어들
            'hair': '머리카락',
            'half': '절반',
            'hand': '손',
            'hang': '걸다',
            'happen': '일어나다',
            'happy': '행복한',
            'hard': '어려운',
            'have': '가지다',
            'he': '그는',
            'head': '머리',
            'health': '건강',
            'hear': '듣다',
            'heart': '심장',
            'heat': '열',
            'heavy': '무거운',
            'help': '도움',
            'her': '그녀의',
            'here': '여기',
            'herself': '그녀 자신',
            'high': '높은',
            'him': '그를',
            'himself': '그 자신',
            'his': '그의',
            'history': '역사',
            'hit': '치다',
            'hold': '잡다',
            'home': '집',
            'hope': '희망',
            'hospital': '병원',
            'hot': '뜨거운',
            'hotel': '호텔',
            'hour': '시간',
            'house': '집',
            'how': '어떻게',
            'however': '그러나',
            'huge': '거대한',
            'human': '인간',
            'hundred': '100',
            'husband': '남편',
            
            // I로 시작하는 단어들
            'I': '나는',
            'idea': '아이디어',
            'identify': '식별하다',
            'if': '만약',
            'image': '이미지',
            'imagine': '상상하다',
            'impact': '영향',
            'important': '중요한',
            'improve': '개선하다',
            'in': '~안에',
            'include': '포함하다',
            'including': '~를 포함하여',
            'increase': '증가하다',
            'indeed': '실제로',
            'indicate': '나타내다',
            'individual': '개인',
            'industry': '산업',
            'information': '정보',
            'inside': '내부',
            'instead': '대신에',
            'institution': '기관',
            'interest': '관심',
            'interesting': '흥미로운',
            'international': '국제적인',
            'interview': '인터뷰',
            'into': '~안으로',
            'investment': '투자',
            'involve': '포함시키다',
            'issue': '문제',
            'it': '그것',
            'item': '항목',
            'its': '그것의',
            'itself': '그것 자체',
            
            // J, K, L로 시작하는 단어들
            'job': '직업',
            'join': '합류하다',
            'just': '단지',
            'keep': '유지하다',
            'key': '열쇠',
            'kid': '아이',
            'kill': '죽이다',
            'kind': '친절한',
            'kitchen': '부엌',
            'know': '알다',
            'knowledge': '지식',
            'land': '땅',
            'language': '언어',
            'large': '큰',
            'last': '마지막',
            'late': '늦은',
            'later': '나중에',
            'laugh': '웃다',
            'law': '법',
            'lawyer': '변호사',
            'lay': '놓다',
            'lead': '이끌다',
            'leader': '지도자',
            'learn': '배우다',
            'least': '최소한',
            'leave': '떠나다',
            'left': '왼쪽',
            'leg': '다리',
            'legal': '법적인',
            'less': '더 적은',
            'let': '시키다',
            'letter': '편지',
            'level': '수준',
            'lie': '거짓말',
            'life': '삶',
            'light': '빛',
            'like': '좋아하다',
            'line': '선',
            'list': '목록',
            'listen': '듣다',
            'little': '작은',
            'live': '살다',
            'local': '지역의',
            'long': '긴',
            'look': '보다',
            'lose': '잃다',
            'loss': '손실',
            'lot': '많은',
            'love': '사랑',
            'low': '낮은',
            
            // M로 시작하는 단어들
            'machine': '기계',
            'magazine': '잡지',
            'main': '주요한',
            'maintain': '유지하다',
            'major': '주요한',
            'make': '만들다',
            'man': '남자',
            'manage': '관리하다',
            'management': '관리',
            'manager': '관리자',
            'many': '많은',
            'market': '시장',
            'marriage': '결혼',
            'material': '재료',
            'matter': '문제',
            'may': '할 수도 있다',
            'maybe': '아마도',
            'me': '나를',
            'mean': '의미하다',
            'measure': '측정하다',
            'media': '미디어',
            'medical': '의학적인',
            'meet': '만나다',
            'meeting': '회의',
            'member': '구성원',
            'memory': '기억',
            'mention': '언급하다',
            'message': '메시지',
            'method': '방법',
            'middle': '중간',
            'might': '할 수도 있다',
            'military': '군사의',
            'million': '백만',
            'mind': '마음',
            'minute': '분',
            'miss': '놓치다',
            'mission': '임무',
            'model': '모델',
            'modern': '현대의',
            'moment': '순간',
            'money': '돈',
            'month': '달',
            'more': '더',
            'morning': '아침',
            'most': '가장',
            'mother': '어머니',
            'move': '움직이다',
            'movement': '움직임',
            'movie': '영화',
            'much': '많은',
            'music': '음악',
            'must': '해야 한다',
            'my': '나의',
            'myself': '나 자신',
            
            // N, O로 시작하는 단어들
            'name': '이름',
            'nation': '국가',
            'national': '국가의',
            'natural': '자연의',
            'nature': '자연',
            'near': '가까운',
            'nearly': '거의',
            'necessary': '필요한',
            'need': '필요',
            'network': '네트워크',
            'never': '결코',
            'new': '새로운',
            'news': '뉴스',
            'newspaper': '신문',
            'next': '다음',
            'nice': '좋은',
            'night': '밤',
            'nine': '9',
            'no': '아니다',
            'none': '아무것도',
            'north': '북쪽',
            'not': '~이 아니다',
            'note': '노트',
            'nothing': '아무것도',
            'notice': '알아차리다',
            'now': '지금',
            'number': '숫자',
            'occur': '일어나다',
            'of': '~의',
            'off': '떨어져',
            'offer': '제공하다',
            'office': '사무실',
            'officer': '장교',
            'official': '공식적인',
            'often': '자주',
            'oh': '오',
            'oil': '기름',
            'ok': '괜찮다',
            'old': '오래된',
            'on': '~위에',
            'once': '한 번',
            'one': '하나',
            'only': '오직',
            'onto': '~위로',
            'open': '열다',
            'operation': '운영',
            'opportunity': '기회',
            'option': '선택',
            'or': '또는',
            'order': '주문',
            'organization': '조직',
            'other': '다른',
            'others': '다른 사람들',
            'our': '우리의',
            'out': '밖으로',
            'outside': '밖',
            'over': '~위에',
            'own': '자신의',
            'owner': '소유자',
            
            // P로 시작하는 단어들
            'page': '페이지',
            'pain': '고통',
            'painting': '그림',
            'paper': '종이',
            'parent': '부모',
            'park': '공원',
            'part': '부분',
            'participant': '참가자',
            'particular': '특별한',
            'particularly': '특히',
            'partner': '파트너',
            'party': '파티',
            'pass': '지나가다',
            'past': '과거',
            'patient': '환자',
            'pattern': '패턴',
            'pay': '지불하다',
            'peace': '평화',
            'people': '사람들',
            'per': '~당',
            'perform': '수행하다',
            'performance': '성과',
            'perhaps': '아마도',
            'period': '기간',
            'person': '사람',
            'personal': '개�
            'popular': '인기있는',
            'population': '인구',
            'position': '위치',
            'positive': '긍정적인',
            'possible': '가능한',
            'power': '힘',
            'practice': '연습',
            'prepare': '준비하다',
            'present': '현재',
            'president': '대통령',
            'pressure': '압력',
            'pretty': '예쁜',
            'prevent': '방지하다',
            'price': '가격',
            'private': '개인의',
            'probably': '아마도',
            'problem': '문제',
            'process': '과정',
            'produce': '생산하다',
            'product': '제품',
            'production': '생산',
            'professional': '전문적인',
            'professor': '교수',
            'program': '프로그램',
            'project': '프로젝트',
            'property': '재산',
            'protect': '보호하다',
            'prove': '증명하다',
            'provide': '제공하다',
            'public': '공공의',
            'pull': '당기다',
            'purpose': '목적',
            'push': '밀다',
            'put': '놓다',
            
            // Q, R로 시작하는 단어들
            'quality': '품질',
            'question': '질문',
            'quickly': '빨리',
            'quite': '꽤',
            'race': '경주',
            'radio': '라디오',
            'raise': '올리다',
            'range': '범위',
            'rate': '비율',
            'rather': '오히려',
            'reach': '도달하다',
            'read': '읽다',
            'ready': '준비된',
            'real': '진짜의',
            'reality': '현실',
            'realize': '깨닫다',
            'really': '정말로',
            'reason': '이유',
            'receive': '받다',
            'recent': '최근의',
            'recognize': '인식하다',
            'record': '기록',
            'red': '빨간색',
            'reduce': '줄이다',
            'reflect': '반영하다',
            'region': '지역',
            'relate': '관련시키다',
            'relationship': '관계',
            'religious': '종교적인',
            'remain': '남다',
            'remember': '기억하다',
            'remove': '제거하다',
            'report': '보고서',
            'represent': '대표하다',
            'require': '요구하다',
            'research': '연구',
            'resource': '자원',
            'respond': '응답하다',
            'response': '응답',
            'responsibility': '책임',
            'rest': '휴식',
            'result': '결과',
            'return': '돌아가다',
            'reveal': '밝히다',
            'rich': '부유한',
            'right': '오른쪽',
            'rise': '상승하다',
            'risk': '위험',
            'road': '길',
            'rock': '바위',
            'role': '역할',
            'room': '방',
            'rule': '규칙',
            'run': '달리다',
            
            // S로 시작하는 단어들 (일부)
            'safe': '안전한',
            'same': '같은',
            'save': '저장하다',
            'say': '말하다',
            'scene': '장면',
            'school': '학교',
            'science': '과학',
            'scientist': '과학자',
            'score': '점수',
            'sea': '바다',
            'season': '계절',
            'seat': '좌석',
            'second': '두 번째',
            'section': '부분',
            'security': '보안',
            'see': '보다',
            'seek': '찾다',
            'seem': '~인 것 같다',
            'sell': '팔다',
            'send': '보내다',
            'senior': '고위의',
            'sense': '감각',
            'series': '시리즈',
            'serious': '심각한',
            'serve': '서비스하다',
            'service': '서비스',
            'set': '설정하다',
            'seven': '7',
            'several': '몇몇의',
            'sex': '성별',
            'sexual': '성적인',
            'shake': '흔들다',
            'share': '공유하다',
            'she': '그녀는',
            'shoot': '쏘다',
            'shopping': '쇼핑',
            'short': '짧은',
            'shot': '총격',
            'should': '해야 한다',
            'show': '보여주다',
            'side': '옆',
            'sign': '표시',
            'significant': '중요한',
            'similar': '비슷한',
            'simple': '간단한',
            'simply': '단순히',
            'since': '~이후로',
            'sing': '노래하다',
            'single': '단일한',
            'sister': '자매',
            'sit': '앉다',
            'site': '사이트',
            'situation': '상황',
            'six': '6',
            'size': '크기',
            'skill': '기술',
            'skin': '피부',
            'small': '작은',
            'smile': '미소',
            'so': '그래서',
            'social': '사회적인',
            'society': '사회',
            'soldier': '군인',
            'some': '어떤',
            'someone': '누군가',
            'something': '무언가',
            'sometimes': '때때로',
            'son': '아들',
            'song': '노래',
            'soon': '곧',
            'sort': '종류',
            'sound': '소리',
            'source': '출처',
            'south': '남쪽',
            'southern': '남쪽의',
            'space': '공간',
            'speak': '말하다',
            'special': '특별한',
            'specific': '구체적인',
            'speech': '연설',
            'spend': '쓰다',
            'sport': '스포츠',
            'spring': '봄',
            'staff': '직원',
            'stage': '무대',
            'stand': '서다',
            'standard': '기준',
            'star': '별',
            'start': '시작하다',
            'state': '상태',
            'statement': '성명',
            'station': '역',
            'stay': '머물다',
            'step': '단계',
            'still': '여전히',
            'stock': '주식',
            'stop': '멈추다',
            'store': '가게',
            'story': '이야기',
            'strategy': '전략',
            'street': '거리',
            'strong': '강한',
            'structure': '구조',
            'student': '학생',
            'study': '공부하다',
            'stuff': '물건',
            'style': '스타일',
            'subject': '주제',
            'success': '성공',
            'successful': '성공적인',
            'such': '그런',
            'suddenly': '갑자기',
            'suffer': '고통받다',
            'suggest': '제안하다',
            'summer': '여름',
            'sun': '태양',
            'support': '지원하다',
            'sure': '확실한',
            'surface': '표면',
            'system': '시스템',
            
            // T로 시작하는 단어들
            'table': '테이블',
            'take': '가져가다',
            'talk': '말하다',
            'task': '과제',
            'tax': '세금',
            'teach': '가르치다',
            'teacher': '교사',
            'team': '팀',
            'technology': '기술',
            'television': '텔레비전',
            'tell': '말하다',
            'ten': '10',
            'tend': '~하는 경향이 있다',
            'term': '용어',
            'test': '시험',
            'than': '~보다',
            'thank': '감사하다',
            'that': '그것',
            'the': '그',
            'their': '그들의',
            'them': '그들을',
            'themselves': '그들 자신',
            'then': '그때',
            'theory': '이론',
            'there': '거기',
            'these': '이것들',
            'they': '그들은',
            'thing': '것',
            'think': '생각하다',
            'third': '세 번째',
            'this': '이것',
            'those': '저것들',
            'though': '비록',
            'thought': '생각',
            'thousand': '천',
            'threat': '위협',
            'three': '3',
            'through': '~를 통해',
            'throughout': '~전체에',
            'throw': '던지다',
            'thus': '따라서',
            'time': '시간',
            'tiny': '작은',
            'title': '제목',
            'to': '~에',
            'today': '오늘',
            'together': '함께',
            'tonight': '오늘밤',
            'too': '너무',
            'top': '꼭대기',
            'total': '전체',
            'tough': '힘든',
            'toward': '~쪽으로',
            'town': '마을',
            'trade': '무역',
            'traditional': '전통적인',
            'training': '훈련',
            'travel': '여행',
            'treat': '대우하다',
            'treatment': '치료',
            'tree': '나무',
            'trial': '재판',
            'trip': '여행',
            'trouble': '문제',
            'true': '진실한',
            'truth': '진실',
            'try': '노력하다',
            'turn': '돌리다',
            'TV': '텔레비전',
            'two': '2',
            'type': '유형',
            
            // U, V, W로 시작하는 단어들
            'under': '~아래에',
            'understand': '이해하다',
            'unit': '단위',
            'until': '~까지',
            'up': '위로',
            'upon': '~위에',
            'us': '우리를',
            'use': '사용하다',
            'used': '사용된',
            'user': '사용자',
            'usually': '보통',
            'value': '가치',
            'various': '다양한',
            'very': '매우',
            'via': '~을 통해',
            'victim': '피해자',
            'view': '보다',
            'violence': '폭력',
            'visit': '방문하다',
            'voice': '목소리',
            'vote': '투표하다',
            'wait': '기다리다',
            'walk': '걷다',
            'wall': '벽',
            'want': '원하다',
            'war': '전쟁',
            'watch': '보다',
            'water': '물',
            'way': '방법',
            'we': '우리는',
            'weapon': '무기',
            'wear': '입다',
            'week': '주',
            'weight': '무게',
            'well': '잘',
            'west': '서쪽',
            'western': '서쪽의',
            'what': '무엇',
            'whatever': '무엇이든',
            'when': '언제',
            'where': '어디',
            'whether': '~인지',
            'which': '어떤',
            'while': '~하는 동안',
            'white': '흰색',
            'who': '누구',
            'whole': '전체',
            'whom': '누구를',
            'whose': '누구의',
            'why': '왜',
            'wide': '넓은',
            'wife': '아내',
            'will': '할 것이다',
            'win': '이기다',
            'wind': '바람',
            'window': '창문',
            'wish': '바라다',
            'with': '~와 함께',
            'within': '~안에',
            'without': '~없이',
            'woman': '여성',
            'wonder': '궁금해하다',
            'word': '단어',
            'work': '일하다',
            'worker': '노동자',
            'working': '일하는',
            'world': '세계',
            'worry': '걱정하다',
            'worse': '더 나쁜',
            'worst': '최악의',
            'worth': '가치있는',
            'would': '할 것이다',
            'write': '쓰다',
            'writer': '작가',
            'wrong': '잘못된',
            
            // Y, Z로 시작하는 단어들
            'yard': '마당',
            'yeah': '네',
            'year': '년',
            'yes': '네',
            'yet': '아직',
            'you': '당신',
            'young': '젊은',
            'your': '당신의',
            'yourself': '당신 자신',
            'zone': '지역'
        };

        return offlineDictionary[text.toLowerCase()];
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
const dictionaryService = new DictionaryService();Listener((details) => {
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