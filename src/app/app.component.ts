import { Component, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isBrowserSupported: boolean;
  prompterForm: FormGroup;
  prompterWords: string[];
  prompterIsActive: boolean;
  prompterIsPaused: boolean;

  @ViewChild('prompterBoard')
  prompterBoard: ElementRef;

  private _recognition: any;
  private _restartOnEnd: boolean;
  private _cursorPosition: number;
  private _lookAheadWordCount: number;
  private _foundWordCache: string[];
  private _transcriptCache: string;

  constructor(
    private _formBuilder: FormBuilder,
    private _changeDetectorRef: ChangeDetectorRef
  ) {
    this.isBrowserSupported = 'webkitSpeechRecognition' in window;
    this.prompterIsActive = false;
    this.prompterIsPaused = false;

    this._cursorPosition = 0;
    this._restartOnEnd = false;
    this._lookAheadWordCount = 5;
    this._foundWordCache = [];
  }

  get cursorPosition(): number {
    return this._cursorPosition;
  }

  set cursorPosition(position: number) {
    this._cursorPosition = position;
    this.scrollIntoView(position);
  }

  ngOnInit() {
    if (!this.isBrowserSupported) {
      return;
    }

    this.setupRecognition();
    this.buildForm();
    this.loadScript();
  }

  /**
   * Event handler for start button click.
   */
  startClick() {
    this.saveScript();
    this.assignWords();
    this.startPrompter();

    setTimeout(() => this.scrollIntoView(0), 100);
  }

  /**
   * Event handler for click on prompter words.
   */
  wordClick(e: any, index: number) {
    this.cursorPosition = index;
    this.restartPrompter();
    this.scrollIntoView(e.target);
  }

  /**
   * Event handler for play/pause button click.
   */
  togglePlayPauseClick() {
    this.prompterIsPaused = !this.prompterIsPaused;

    if (this.prompterIsPaused) {
      this.pausePrompter();
    } else {
      this.startPrompter();
    }
  }

  /**
   * Event handler for done button click.
   */
  doneClick() {
    this.stopPrompter();
    this.cursorPosition = 0;
  }

  /**
   * Initializes speech recognition
   */
  setupRecognition(): void {
    this._recognition = new (<any>window).webkitSpeechRecognition();

    this._recognition.continuous = true;
    this._recognition.interimResults = true;

    // Attempt to restart speech recognition if it stops by accident
    this._recognition.onend = () => {
      if (!this._restartOnEnd) {
        return;
      }

      try {
        this._recognition.start();
      } catch (err) {
        console.log(err);
      }
    };

    // Add handler when speech result is received
    this._recognition.onresult =
      (e: SpeechRecognitionEvent) => this.handleSpeechResult(e);
  }

  /**
   * Sets up the reactive form.
   */
  buildForm(): void {
    this.prompterForm = this._formBuilder.group({
      inputText: ['']
    });
  }

  /**
   * Saves prompter script for future use.
   */
  saveScript(): void {
    const text = this.prompterForm.get('inputText').value;
    window.localStorage.setItem('script', text);
  }

  /**
   * Loads prompter script if available.
   */
  loadScript(): void {
    const text = window.localStorage.getItem('script');

    if (text) {
      this.prompterForm.get('inputText').patchValue(text);
    }
  }

  /**
   * Splits up words in the script for use in the prompter.
   */
  assignWords(): void {
    const text = this.prompterForm.get('inputText').value ||
      'Enter text for prompter.';
    const singleLineText = text.replace(/\s/g, ' ');

    this.prompterWords = singleLineText.split(' ');
  }

  /**
   * Starts prompter and speech recognition.
   */
  startPrompter(): void {
    this._restartOnEnd = true;

    try {
      this._recognition.start();
      this.prompterIsActive = true;
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Stops prompter and speech recognition.
   */
  stopPrompter(): void {
    this._restartOnEnd = false;

    try {
      this._recognition.abort();
      this.prompterIsActive = false;
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Stops prompter and speech recognition while keeping the prompter active.
   */
  pausePrompter(): void {
    this._restartOnEnd = false;

    try {
      this._recognition.stop();
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Stops the prompter, reinitializes, and starts it again.
   */
  restartPrompter(): void {
    this._restartOnEnd = false;

    try {
      this._recognition.abort();

      // Wait a little before starting again. Chrome doesn't work otherwise.
      setTimeout(() => {
        this._recognition.start();

        this._restartOnEnd = true;
        this.prompterIsActive = true;
      }, 250);
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Updates the prompterv cursor when spoken words match.
   * @param e The speech recognition event.
   */
  handleSpeechResult(e: SpeechRecognitionEvent): void {
    const resultsLength = e.results.length;
    const maxTranscriptLength = 50;
    let transcript = '';

    // Concatenate result transcripts
    for (let i = 0; i < resultsLength; i++) {
      if (e.results[i][0].confidence < .85) {
        break;
      }

      let transcriptPart = e.results[i][0].transcript
        .trim()
        .substr(-maxTranscriptLength / 2);

      if (transcriptPart.length === maxTranscriptLength / 2) {
        transcriptPart = transcriptPart.substr(transcriptPart.indexOf(' ') + 1);
      }

      transcript += ' ' + transcriptPart;
    }

    if (transcript.length > maxTranscriptLength) {
      transcript = transcript.substr(maxTranscriptLength);
      transcript = transcript.substr(transcript.indexOf(' ') + 1);
    }

    transcript = transcript.trim();

    if (!transcript || transcript === this._transcriptCache) {
      return;
    }

    // Cache previous transcript to avoid processing duplicates
    this._transcriptCache = transcript;

    // Convert transcript and prompter text into comparable arrays
    const spokenWords = transcript
      .toLowerCase()
      .replace(/[^a-z|\s]/g, '')
      .split(' ')
      .slice(-this._lookAheadWordCount)
      .map(x => x.slice(0, 5));
    const nextPrompterWords = this.prompterWords
      .slice(this.cursorPosition, this.cursorPosition + this._lookAheadWordCount)
      .map(x => x.toLowerCase().replace(/[^a-z|\s]/g, '').slice(0, 5));

    // Loop through transcript words to find matches
    for (let i = spokenWords.length - 1; i >= 0; i--) {
      const currentSpokenWord = spokenWords[i];

      // Ignore recently used words
      if (this._foundWordCache.includes(currentSpokenWord)) {
        continue;
      }

      const foundIndex = nextPrompterWords.findIndex(x => x === currentSpokenWord);

      if (foundIndex > -1) {
        // Cache found word to prevent future accidental matches
        this._foundWordCache.push(currentSpokenWord);

        setTimeout(() => {
          this._foundWordCache.shift();
        }, 5000);

        // Advance cursor position
        this.cursorPosition += foundIndex + 1;
        this._changeDetectorRef.detectChanges();

        break;
      }
    }
  }

  /**
   * Scrolls the prompter to the provided word.
   * @param word The word index or element to scroll into view.
   */
  scrollIntoView(word: number | HTMLElement): void {
    let wordElement: HTMLElement;

    if (typeof(word) === 'number') {
      const prompterElement = <HTMLDivElement>this.prompterBoard.nativeElement;

      wordElement = prompterElement
        .querySelector(`span:nth-child(${word + 1})`);
    } else {
      wordElement = word;
    }

    if (wordElement) {
      const scrollTop = wordElement.offsetTop - 80; // TODO: Don't use magic number

      wordElement.parentElement.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }
  }
}
