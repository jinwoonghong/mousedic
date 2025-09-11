// English Dictionary Extension - Content Script
class EnglishDictionary {
    constructor() {
        console.log('🔤 English Dictionary Extension: Initializing...');
        this.popup = null;
        this.currentSelection = '';
        this.isPopupVisible = false;
        this.timeoutId = null;
        this.hideDelayId = null;
        this.init();
    }

    init() {
        console.log('🔤 Dictionary: Creating popup element...');
        this.createPopupElement();
        console.log('🔤 Dictionary: Attaching event listeners...');
        this.attachEventListeners();
        console.log('🔤 Dictionary: Initialization complete!');
    }

    createPopupElement() {
        this.popup = document.createElement('div');
        this.popup.id = 'english-dict-popup';
        this.popup.className = 'english-dict-popup';
        this.popup.style.display = 'none';
        
        // 팝업 내부 클릭 시 이벤트 전파 방지
        this.popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 팝업에 마우스 진입/이탈 이벤트
        this.popup.addEventListener('mouseenter', () => {
            clearTimeout(this.hideDelayId);
        });
        
        this.popup.addEventListener('mouseleave', (e) => {
            // 팝업에서 나갈 때만 숨김 (X버튼 클릭 제외)
            if (!e.relatedTarget || !this.popup.contains(e.relatedTarget)) {
                this.hideDelayId = setTimeout(() => {
                    this.hidePopup();
                }, 500); // 0.5초 지연
            }
        });
        
        document.body.appendChild(this.popup);
    }

    attachEventListeners() {
        // 마우스 선택 이벤트
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // 마우스 호버 이벤트 (단어 위에 마우스 올릴 때) - 딜레이 단축
        document.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        document.addEventListener('mouseout', (e) => this.handleMouseOut(e));
        
        // 키보드 이벤트 (ESC로 팝업 닫기)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hidePopup();
            }
        });

        // 팝업에서 테스트 메시지 수신 (선택사항 - 페이지에 표시하고 싶을 때)
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'testWord' && request.word) {
                this.testWord(request.word);
                sendResponse({ success: true });
            } else if (request.action === 'showInPage' && request.word && request.data) {
                // 팝업에서 검색한 결과를 페이지에도 표시
                this.showPopupWithData(request.word, request.data);
                sendResponse({ success: true });
            }
        });
    }

    // 팝업에서 단어 테스트용 메소드
    testWord(word) {
        console.log('🔤 Dictionary: Testing word from popup:', word);
        
        // 현재 팝업이 있으면 숨김
        this.hidePopup();
        
        // 잠시 후 화면 중앙에 팝업 표시
        setTimeout(() => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.currentSelection = word;
            this.showPopupAtPosition(centerX, centerY, word);
        }, 100);
    }

    // 미리 준비된 데이터로 팝업 표시
    showPopupWithData(word, data) {
        console.log('🔤 Dictionary: Showing popup with prepared data:', word);
        
        this.hidePopup();
        
        setTimeout(() => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.currentSelection = word;
            this.displayDefinition(centerX, centerY, word, data);
        }, 100);
    }

    // 폴백 오디오 재생
    tryFallbackAudio(audioUrl) {
        try {
            const fallbackAudio = new Audio(audioUrl);
            fallbackAudio.crossOrigin = 'anonymous';
            fallbackAudio.preload = 'auto';
            
            fallbackAudio.addEventListener('canplaythrough', () => {
                fallbackAudio.play()
                    .then(() => console.log('🔊 Fallback audio playing successfully'))
                    .catch(err => console.error('Fallback audio failed:', err));
            });
            
            fallbackAudio.load();
        } catch (error) {
            console.error('Fallback audio creation failed:', error);
        }
    }

    handleMouseUp(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        console.log('🔤 Dictionary: Mouse up detected, selected text:', selectedText);
        
        if (selectedText && this.isEnglishWord(selectedText)) {
            console.log('🔤 Dictionary: Valid English word detected:', selectedText);
            this.currentSelection = selectedText;
            this.showPopupAtPosition(e.clientX, e.clientY, selectedText);
        } else {
            console.log('🔤 Dictionary: Invalid or no selection, hiding popup');
            this.hidePopup();
        }
    }

    handleMouseOver(e) {
        // 팝업이 표시된 상태에서 팝업 위에 마우스가 있으면 숨기지 않음
        if (this.isPopupVisible && this.popup && this.popup.contains(e.target)) {
            return;
        }

        // 마우스 호버 시 단어 감지 (딜레이 단축)
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => {
            const word = this.getWordUnderMouse(e.target, e);
            if (word && this.isEnglishWord(word) && word !== this.currentSelection) {
                this.currentSelection = word;
                this.showPopupAtPosition(e.clientX, e.clientY, word);
            }
        }, 150); // 150ms로 단축 (더 빠른 반응)
    }

    handleMouseOut(e) {
        clearTimeout(this.timeoutId);
        
        // 팝업으로 마우스가 이동했는지 확인
        if (this.popup && this.popup.contains(e.relatedTarget)) {
            return; // 팝업으로 이동했으면 숨기지 않음
        }
        
        // 팝업이 아닌 다른 곳으로 이동했으면 지연 후 숨김
        this.hideDelayId = setTimeout(() => {
            if (!this.isMouseOverPopup(e)) {
                this.hidePopup();
            }
        }, 300); // 300ms 지연으로 실수로 숨겨지는 것 방지
    }

    // 문서 클릭 이벤트 제거 - X 버튼으로만 닫도록 함

    getWordUnderMouse(element, event) {
        // 텍스트 노드에서 마우스 위치의 단어 추출
        if (element.nodeType === Node.TEXT_NODE || element.textContent) {
            const text = element.textContent || element.innerText;
            const range = document.caretRangeFromPoint(event.clientX, event.clientY);
            
            if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                const textContent = range.startContainer.textContent;
                const offset = range.startOffset;
                
                // 단어 경계 찾기
                let start = offset;
                let end = offset;
                
                // 단어 시작점 찾기
                while (start > 0 && /[a-zA-Z]/.test(textContent[start - 1])) {
                    start--;
                }
                
                // 단어 끝점 찾기
                while (end < textContent.length && /[a-zA-Z]/.test(textContent[end])) {
                    end++;
                }
                
                const word = textContent.substring(start, end).trim();
                return word.length > 1 ? word : null;
            }
        }
        return null;
    }

    isEnglishWord(text) {
        // 영어 단어인지 확인 (최소 2글자, 영문자만 포함)
        return /^[a-zA-Z]{2,}$/.test(text) && text.length <= 50;
    }

    async showPopupAtPosition(x, y, word) {
        if (!word || !this.isEnglishWord(word)) return;

        this.showLoadingPopup(x, y, word);
        
        try {
            const definition = await this.fetchDefinition(word);
            this.displayDefinition(x, y, word, definition);
        } catch (error) {
            console.error('사전 데이터 가져오기 실패:', error);
            this.showErrorPopup(x, y, word);
        }
    }

    showLoadingPopup(x, y, word) {
        this.popup.innerHTML = `
            <div class="dict-header">
                <span class="dict-word">${word}</span>
                <button class="dict-close" data-action="close">×</button>
            </div>
            <div class="dict-content">
                <div class="dict-loading">로딩 중...</div>
            </div>
        `;
        
        // 닫기 버튼 이벤트 리스너
        const closeBtn = this.popup.querySelector('.dict-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.hidePopup();
            });
        }
        
        this.positionPopup(x, y);
        this.popup.style.display = 'block';
        this.isPopupVisible = true;
    }

    async fetchDefinition(word) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchDefinition',
                word: word
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.data);
                }
            });
        });
    }

    displayDefinition(x, y, word, data) {
        if (!data || !data[0]) {
            this.showErrorPopup(x, y, word);
            return;
        }

        const wordData = data[0];
        const phonetics = wordData.phonetics || [];
        const meanings = wordData.meanings || [];

        let phoneticText = '';
        let audioUrl = '';

        // 발음 기호와 오디오 URL 찾기
        for (const phonetic of phonetics) {
            if (phonetic.text && !phoneticText) {
                phoneticText = phonetic.text;
            }
            if (phonetic.audio && !audioUrl) {
                audioUrl = phonetic.audio;
            }
        }

        // 주요 의미들 추출 (Google 번역 스타일)
        let definitionsHtml = '';
        meanings.slice(0, 3).forEach((meaning, index) => {
            const partOfSpeech = meaning.partOfSpeech || '';
            const definitions = meaning.definitions || [];
            const meaningSynonyms = meaning.synonyms || [];
            
            if (definitions.length > 0) {
                // 각 품사별로 여러 정의 표시
                let definitionsList = '';
                definitions.forEach((definition, defIndex) => {
                    const koreanDef = definition.koreanDefinition || definition.definition;
                    const koreanEx = definition.koreanExample || definition.example;
                    const synonyms = definition.synonyms || [];
                    
                    definitionsList += `
                        <div class="dict-single-def">
                            <div class="dict-definition-text">
                                <div class="dict-korean">${koreanDef}</div>
                                ${definition.koreanDefinition ? `<div class="dict-english">${definition.definition}</div>` : ''}
                            </div>
                            ${definition.example ? `
                                <div class="dict-example">
                                    ${koreanEx ? `<div class="dict-korean-example">"${koreanEx}"</div>` : ''}
                                    <div class="dict-english-example">"${definition.example}"</div>
                                </div>
                            ` : ''}
                            ${synonyms.length > 0 ? `
                                <div class="dict-synonyms">
                                    <span class="dict-synonyms-label">유의어:</span>
                                    <span class="dict-synonyms-list">${synonyms.join(', ')}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
                
                definitionsHtml += `
                    <div class="dict-meaning">
                        <div class="dict-pos-section">
                            <span class="dict-pos">${partOfSpeech}</span>
                        </div>
                        ${definitionsList}
                        ${meaningSynonyms.length > 0 ? `
                            <div class="dict-meaning-synonyms">
                                <span class="dict-synonyms-label">관련 단어:</span>
                                <span class="dict-synonyms-list">${meaningSynonyms.join(', ')}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        });

        this.popup.innerHTML = `
            <div class="dict-header">
                <div class="dict-word-info">
                    <span class="dict-word">${word}</span>
                    ${phoneticText ? `<span class="dict-phonetic">${phoneticText}</span>` : ''}
                    ${audioUrl ? `<button class="dict-play-btn" data-audio-url="${audioUrl}">🔊</button>` : ''}
                </div>
                <button class="dict-close" data-action="close">×</button>
            </div>
            <div class="dict-content">
                ${definitionsHtml}
                ${audioUrl ? `<audio src="${audioUrl}" preload="none"></audio>` : ''}
            </div>
        `;

        // 이벤트 리스너를 직접 추가 (onclick 대신)
        const playBtn = this.popup.querySelector('.dict-play-btn');
        const closeBtn = this.popup.querySelector('.dict-close');
        const audio = this.popup.querySelector('audio');

        if (playBtn && audio) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 팝업 위치 고정 및 타이머 정리
                clearTimeout(this.hideDelayId);
                clearTimeout(this.timeoutId);
                
                // 팝업 재위치 방지
                this.popup.style.position = 'fixed';
                
                // 오디오 로드 및 재생
                if (audio.src) {
                    audio.load(); // 오디오 리로드
                    const playPromise = audio.play();
                    
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => {
                                console.log('🔊 Audio playing successfully');
                            })
                            .catch(error => {
                                console.error('Audio play failed:', error);
                                // 폴백: 새 오디오 엘리먼트로 재시도
                                this.tryFallbackAudio(audio.src);
                            });
                    }
                } else {
                    console.error('No audio source available');
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.hidePopup();
            });
        }

        this.positionPopup(x, y);
        this.popup.style.display = 'block';
        this.isPopupVisible = true;
    }

    showErrorPopup(x, y, word) {
        this.popup.innerHTML = `
            <div class="dict-header">
                <span class="dict-word">${word}</span>
                <button class="dict-close" data-action="close">×</button>
            </div>
            <div class="dict-content">
                <div class="dict-error">단어를 찾을 수 없습니다.</div>
            </div>
        `;
        
        // 닫기 버튼 이벤트 리스너
        const closeBtn = this.popup.querySelector('.dict-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.hidePopup();
            });
        }
        
        this.positionPopup(x, y);
        this.popup.style.display = 'block';
        this.isPopupVisible = true;
    }

    positionPopup(x, y) {
        const popup = this.popup;
        const popupRect = popup.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 기본 위치 설정
        let left = x + 10;
        let top = y + 10;

        // 화면 우측 경계 확인
        if (left + 300 > viewportWidth) {
            left = x - 310;
        }

        // 화면 하단 경계 확인
        if (top + 200 > viewportHeight) {
            top = y - 210;
        }

        // 최소값 보정
        left = Math.max(10, left);
        top = Math.max(10, top);

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    isMouseOverPopup(event) {
        return this.popup && this.popup.contains(event.relatedTarget);
    }

    hidePopup() {
        if (this.popup) {
            this.popup.style.display = 'none';
            this.isPopupVisible = false;
            this.currentSelection = '';
        }
        
        // 타이머 정리
        clearTimeout(this.timeoutId);
        clearTimeout(this.hideDelayId);
    }
}

// 확장 프로그램 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new EnglishDictionary();
    });
} else {
    new EnglishDictionary();
}