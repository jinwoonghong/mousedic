// English Dictionary Extension - Content Script
class EnglishDictionary {
    constructor() {
        console.log('🔤 English Dictionary Extension: Initializing...');
        this.popup = null;
        this.currentSelection = '';
        this.isPopupVisible = false;
        this.timeoutId = null;
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
        document.body.appendChild(this.popup);
    }

    attachEventListeners() {
        // 마우스 선택 이벤트
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // 마우스 호버 이벤트 (단어 위에 마우스 올릴 때)
        document.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        document.addEventListener('mouseout', (e) => this.handleMouseOut(e));
        
        // 팝업 외부 클릭 시 팝업 닫기
        document.addEventListener('click', (e) => this.handleDocumentClick(e));
        
        // 키보드 이벤트 (ESC로 팝업 닫기)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hidePopup();
            }
        });

        // 팝업에서 테스트 메시지 수신
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'testWord' && request.word) {
                this.testWord(request.word);
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
        // 마우스 호버 시 단어 감지 (디바운싱 적용)
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => {
            const word = this.getWordUnderMouse(e.target, e);
            if (word && this.isEnglishWord(word) && word !== this.currentSelection) {
                this.currentSelection = word;
                this.showPopupAtPosition(e.clientX, e.clientY, word);
            }
        }, 300); // 300ms 지연
    }

    handleMouseOut(e) {
        clearTimeout(this.timeoutId);
        // 팝업 영역으로 마우스가 이동하지 않은 경우에만 숨김
        setTimeout(() => {
            if (!this.isMouseOverPopup(e)) {
                this.hidePopup();
            }
        }, 100);
    }

    handleDocumentClick(e) {
        if (this.popup && !this.popup.contains(e.target)) {
            this.hidePopup();
        }
    }

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
                <button class="dict-close" onclick="document.getElementById('english-dict-popup').style.display='none'">×</button>
            </div>
            <div class="dict-content">
                <div class="dict-loading">로딩 중...</div>
            </div>
        `;
        
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

        // 주요 의미들 추출
        let definitionsHtml = '';
        meanings.slice(0, 3).forEach((meaning, index) => {
            const partOfSpeech = meaning.partOfSpeech || '';
            const definitions = meaning.definitions || [];
            
            if (definitions.length > 0) {
                const definition = definitions[0];
                
                // 한글 번역이 있으면 우선 표시, 없으면 영어 표시
                const koreanDef = definition.koreanDefinition || definition.definition;
                const koreanEx = definition.koreanExample || definition.example;
                
                definitionsHtml += `
                    <div class="dict-meaning">
                        <span class="dict-pos">${partOfSpeech}</span>
                        <div class="dict-definition">
                            <div class="dict-korean">${koreanDef}</div>
                            ${definition.koreanDefinition ? `<div class="dict-english">${definition.definition}</div>` : ''}
                        </div>
                        ${definition.example ? `
                            <div class="dict-example">
                                ${koreanEx ? `<div class="dict-korean-example">"${koreanEx}"</div>` : ''}
                                <div class="dict-english-example">"${definition.example}"</div>
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
                    ${audioUrl ? `<button class="dict-play-btn" onclick="this.closest('.english-dict-popup').querySelector('audio').play()">🔊</button>` : ''}
                </div>
                <button class="dict-close" onclick="document.getElementById('english-dict-popup').style.display='none'">×</button>
            </div>
            <div class="dict-content">
                ${definitionsHtml}
                ${audioUrl ? `<audio src="${audioUrl}" preload="none"></audio>` : ''}
            </div>
        `;

        this.positionPopup(x, y);
        this.popup.style.display = 'block';
        this.isPopupVisible = true;
    }

    showErrorPopup(x, y, word) {
        this.popup.innerHTML = `
            <div class="dict-header">
                <span class="dict-word">${word}</span>
                <button class="dict-close" onclick="document.getElementById('english-dict-popup').style.display='none'">×</button>
            </div>
            <div class="dict-content">
                <div class="dict-error">단어를 찾을 수 없습니다.</div>
            </div>
        `;
        
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