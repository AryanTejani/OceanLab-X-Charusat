interface TranscriptEntry {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  timestamp?: Date;
  // Enhanced fields for AI analysis
  speakerId?: string;
  speakerName?: string;
  emotion?: 'positive' | 'negative' | 'neutral' | 'excited' | 'concerned' | 'confident' | 'uncertain';
  audioQuality?: number; // 0-1 scale
  volume?: number; // 0-1 scale
  speakingRate?: number; // words per minute
  pauseDuration?: number; // milliseconds
  isQuestion?: boolean;
  isInterruption?: boolean;
  technicalTerms?: string[];
  industryContext?: string;
  sentimentScore?: number; // -1 to 1
  urgency?: 'low' | 'medium' | 'high';
  topic?: string;
  actionItems?: string[];
  actionItemsData?: Array<{ text: string; assignedTo?: string }>;
  followUpRequired?: boolean;
}

interface MeetingInfo {
  meetingId: string;
  title?: string;
  startTime?: Date;
  participants?: string[];
  // Enhanced meeting context
  industry?: 'manufacturing' | 'construction' | 'financial-services';
  meetingType?: 'sales' | 'project' | 'review' | 'planning' | 'negotiation';
  attendees?: Array<{
    id: string;
    name: string;
    role: string;
    company?: string;
    email?: string;
    isHost: boolean;
  }>;
  agenda?: string[];
  expectedDuration?: number; // minutes
  recordingQuality?: 'low' | 'medium' | 'high';
  language?: string;
  timezone?: string;
}

class LocalTranscriptStorageClient {
  private currentMeetingId: string | null = null;
  private currentTranscripts: TranscriptEntry[] = [];
  private lastProcessedText: string = '';
  private meetingInfo: MeetingInfo | null = null;

  /**
   * Start a new transcript session for a meeting
   */
  startMeeting(meetingId: string, meetingInfo?: Partial<MeetingInfo>): void {
    this.currentMeetingId = meetingId;
    this.currentTranscripts = [];
    this.lastProcessedText = '';
    this.meetingInfo = {
      meetingId,
      title: meetingInfo?.title || `Meeting ${meetingId}`,
      startTime: meetingInfo?.startTime || new Date(),
      participants: meetingInfo?.participants || [],
      industry: meetingInfo?.industry,
      meetingType: meetingInfo?.meetingType,
      attendees: meetingInfo?.attendees,
      agenda: meetingInfo?.agenda,
      language: meetingInfo?.language,
      timezone: meetingInfo?.timezone,
    };
    console.log(`🎯 Started transcript session for meeting: ${meetingId}`);
  }

  /**
   * Add a new transcript entry with enhanced analysis
   */
  addTranscript(entry: TranscriptEntry): void {
    if (!this.currentMeetingId) {
      console.warn('⚠️ No active meeting session. Call startMeeting() first.');
      return;
    }

    // Only process final transcripts
    if (!entry.isFinal) {
      return;
    }

    // Clean the text
    const cleanText = this.cleanText(entry.text);
    
    // Skip if text is empty or just whitespace
    if (!cleanText.trim()) {
      return;
    }

    // Skip very short texts (likely interim results) - be more strict
    if (cleanText.length < 3) {
      return;
    }

    // Skip single words that are likely interim results
    const words = cleanText.split(/\s+/);
    if (words.length === 1 && words[0].length < 5) {
      return;
    }

    // Check for duplicates against recent transcripts
    if (this.isDuplicateEnhanced(cleanText)) {
      console.log(`🚫 Skipped duplicate: "${cleanText}"`);
      return;
    }

    // Enhanced transcript analysis
    const enhancedEntry = this.enhanceTranscriptData(entry, cleanText);

    // Add business-focused analysis
    (enhancedEntry as any).problems = this.extractProblems(cleanText);
    (enhancedEntry as any).painPoints = this.extractPainPoints(cleanText);
    (enhancedEntry as any).expectations = this.extractExpectations(cleanText);
    (enhancedEntry as any).productivityBlockers = this.extractProductivityBlockers(cleanText);
    (enhancedEntry as any).decisions = this.extractDecisions(cleanText);
    
    // Extract action items with better structure
    const actionItemsData = this.extractActionItems(cleanText);
    enhancedEntry.actionItemsData = actionItemsData;
    // Keep old format for backward compatibility
    enhancedEntry.actionItems = actionItemsData.map(item => item.text);

    this.currentTranscripts.push(enhancedEntry);
    this.lastProcessedText = cleanText;

    console.log(`📝 Added enhanced transcript: "${cleanText}"`);
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s.,!?;:()[\]{}"'`~@#$%^&*+=|\\<>/]/g, '') // Remove special characters but keep punctuation
      .replace(/\s+([.,!?;:])/g, '$1') // Remove spaces before punctuation
      .replace(/([.,!?;:])\s*/g, '$1 ') // Ensure single space after punctuation
      .trim();
  }

  /**
   * Check if text is too short or likely an interim result
   */
  private isInterimResult(text: string): boolean {
    const cleanText = text.trim();
    
    // Skip very short texts (likely interim results)
    if (cleanText.length < 3) {
      return true;
    }
    
    // Skip texts that are just single words repeated
    const words = cleanText.split(/\s+/);
    if (words.length === 1 && words[0].length < 5) {
      return true;
    }
    
    // Skip texts that end with incomplete words (common in interim results)
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length < 3) {
      return true;
    }
    
    return false;
  }

  /**
   * Enhance transcript data with AI analysis features
   */
  private enhanceTranscriptData(entry: TranscriptEntry, cleanText: string): TranscriptEntry {
    const enhancedEntry: TranscriptEntry = {
      ...entry,
      text: cleanText,
      timestamp: entry.timestamp || new Date(),
    };

    // Enhanced speaker identification using AssemblyAI's speaker diarization
    enhancedEntry.speakerId = entry.speakerId || this.identifySpeaker();
    enhancedEntry.speakerName = entry.speakerName || this.getSpeakerName(enhancedEntry.speakerId);

    // Emotion detection based on text analysis
    enhancedEntry.emotion = this.detectEmotion(cleanText);
    enhancedEntry.sentimentScore = this.calculateSentiment(cleanText);

    // Question detection
    enhancedEntry.isQuestion = this.isQuestion(cleanText);

    // Technical terms detection
    enhancedEntry.technicalTerms = this.extractTechnicalTerms(cleanText);

    // Topic classification
    enhancedEntry.topic = this.classifyTopic(cleanText);

    // Urgency detection
    enhancedEntry.urgency = this.detectUrgency(cleanText);

    // Action items detection with better structure
    const actionItemsData = this.extractActionItems(cleanText);
    enhancedEntry.actionItemsData = actionItemsData;
    // Keep old format for backward compatibility
    enhancedEntry.actionItems = actionItemsData.map(item => item.text);
    enhancedEntry.followUpRequired = enhancedEntry.actionItems.length > 0;

    // Speaking rate calculation (words per minute)
    enhancedEntry.speakingRate = this.calculateSpeakingRate(cleanText, entry.start, entry.end);

    // Audio quality estimation (based on confidence)
    enhancedEntry.audioQuality = entry.confidence;
    enhancedEntry.volume = entry.confidence; // Simplified for now

    return enhancedEntry;
  }

  /**
   * Simple speaker identification - works with free API
   */
  private identifySpeaker(): string {
    // Use the first attendee as default speaker
    if (this.meetingInfo?.attendees && this.meetingInfo.attendees.length > 0) {
      return this.meetingInfo.attendees[0].id;
    }
    return 'speaker-1';
  }

  /**
   * Get speaker name from speaker ID
   */
  private getSpeakerName(speakerId: string): string {
    // Handle regular attendee IDs
    if (this.meetingInfo?.attendees) {
      const attendee = this.meetingInfo.attendees.find(a => a.id === speakerId);
      if (attendee) {
        return attendee.name;
      }
    }
    
    return 'Speaker';
  }

  /**
   * Detect emotion from text
   */
  private detectEmotion(text: string): TranscriptEntry['emotion'] {
    const lowerText = text.toLowerCase();
    
    // Positive emotions
    if (lowerText.includes('great') || lowerText.includes('excellent') || lowerText.includes('amazing')) {
      return 'excited';
    }
    if (lowerText.includes('good') || lowerText.includes('nice') || lowerText.includes('perfect') || lowerText.includes('thank') || lowerText.includes('hope') || lowerText.includes('fine') || lowerText.includes('okay') || lowerText.includes('hello')) {
      return 'positive';
    }
    
    // Negative emotions
    if (lowerText.includes('problem') || lowerText.includes('issue') || lowerText.includes('concern')) {
      return 'concerned';
    }
    if (lowerText.includes('bad') || lowerText.includes('terrible') || lowerText.includes('worried') || lowerText.includes('hell') || lowerText.includes('get out') || lowerText.includes('told you')) {
      return 'negative';
    }
    
    // Uncertainty
    if (lowerText.includes('maybe') || lowerText.includes('perhaps') || lowerText.includes('not sure')) {
      return 'uncertain';
    }
    
    // Confidence
    if (lowerText.includes('definitely') || lowerText.includes('certainly') || lowerText.includes('absolutely')) {
      return 'confident';
    }
    
    return 'neutral';
  }

  /**
   * Calculate sentiment score (-1 to 1)
   */
  private calculateSentiment(text: string): number {
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'amazing', 'wonderful', 'fantastic', 'thank', 'thanks', 'appreciate', 'love', 'like', 'happy', 'pleased', 'fine', 'hope', 'okay', 'hello'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'problem', 'issue', 'concern', 'hell', 'damn', 'hate', 'angry', 'frustrated', 'upset', 'get out', 'told you', 'nothing'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    // Check for positive phrases
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) score += 0.1; // Reduced impact
    });
    
    // Check for negative phrases
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) score -= 0.3; // Reduced impact
    });
    
    // Special cases for stronger negative sentiment
    if (lowerText.includes('what the hell') || lowerText.includes('get out')) {
      score -= 0.6;
    }
    
    if (lowerText.includes('told you')) {
      score -= 0.5;
    }
    
    // Special cases for positive sentiment
    if (lowerText.includes('hello') && !lowerText.includes('what the hell')) {
      score += 0.1;
    }
    
    if (lowerText.includes('okay') && !lowerText.includes('not okay')) {
      score += 0.1;
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Detect if text is a question
   */
  private isQuestion(text: string): boolean {
    return text.includes('?') || 
           text.toLowerCase().startsWith('what') ||
           text.toLowerCase().startsWith('how') ||
           text.toLowerCase().startsWith('why') ||
           text.toLowerCase().startsWith('when') ||
           text.toLowerCase().startsWith('where') ||
           text.toLowerCase().startsWith('who') ||
           text.toLowerCase().startsWith('which');
  }

  /**
   * Extract technical terms based on industry context
   */
  private extractTechnicalTerms(text: string): string[] {
    const terms: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Manufacturing terms
    const manufacturingTerms = ['production', 'assembly', 'quality control', 'inventory', 'supply chain', 'manufacturing', 'factory', 'machinery'];
    // Construction terms
    const constructionTerms = ['blueprint', 'foundation', 'contractor', 'subcontractor', 'permit', 'inspection', 'safety', 'materials'];
    // Financial terms
    const financialTerms = ['revenue', 'profit', 'investment', 'portfolio', 'risk', 'compliance', 'audit', 'budget'];
    // Meeting and business terms
    const meetingTerms = ['meeting', 'agenda', 'minutes', 'action item', 'follow up', 'discussion', 'presentation', 'review', 'status', 'update', 'progress', 'deadline', 'timeline', 'schedule', 'purpose', 'objective', 'goal', 'target', 'milestone', 'deliverable'];
    
    const allTerms = [...manufacturingTerms, ...constructionTerms, ...financialTerms, ...meetingTerms];
    
    allTerms.forEach(term => {
      if (lowerText.includes(term)) {
        terms.push(term);
      }
    });
    
    return terms;
  }

  /**
   * Classify topic of the conversation
   */
  private classifyTopic(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('budget')) {
      return 'pricing';
    }
    if (lowerText.includes('delivery') || lowerText.includes('timeline') || lowerText.includes('schedule')) {
      return 'timeline';
    }
    if (lowerText.includes('quality') || lowerText.includes('specification') || lowerText.includes('requirement')) {
      return 'specifications';
    }
    if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('terms')) {
      return 'contract';
    }
    
    return 'general';
  }

  /**
   * Detect urgency level
   */
  private detectUrgency(text: string): 'low' | 'medium' | 'high' {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('immediately')) {
      return 'high';
    }
    if (lowerText.includes('soon') || lowerText.includes('quickly') || lowerText.includes('fast')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Extract action items from text - only extract meaningful, complete action items
   */
  private extractActionItems(text: string): Array<{ text: string; assignedTo?: string }> {
    const actionItems: Array<{ text: string; assignedTo?: string }> = [];
    const lowerText = text.toLowerCase();
    
    // Only extract complete, meaningful action items (not fragments)
    // Look for specific action patterns with clear tasks
    const actionPatterns = [
      /(?:need to|have to|must|should|will|going to)\s+([^.!?]+(?:proposal|cut|remove|find|focus|make|create|update|check|verify|confirm|send|call|meet|review|schedule|arrange|organize|prepare|complete|implement|execute|finish)[^.!?]*)/gi,
      /(?:action item|follow up|task|todo|to do)[\s:]+([^.!?]+)/gi,
      /(?:assign|assigned to|give to|hand over to)\s+(\w+)[\s:]+([^.!?]+)/gi,
    ];
    
    // Extract assignments explicitly mentioned
    const assignmentPattern = /(?:assign|assigned to|give to|hand over to|for)\s+(\w+)/gi;
    let assignedTo: string | undefined;
    const assignmentMatch = assignmentPattern.exec(text);
    if (assignmentMatch) {
      assignedTo = assignmentMatch[1];
    }
    
    // Only add if it's a complete sentence with meaningful content
    if (text.length > 15 && (
      lowerText.includes('need to') || 
      lowerText.includes('must') || 
      lowerText.includes('should') ||
      lowerText.includes('will') ||
      lowerText.includes('action item') ||
      lowerText.includes('follow up') ||
      lowerText.includes('task')
    )) {
      // Make sure it's not just a fragment
      if (text.trim().endsWith('.') || text.trim().endsWith('!') || text.trim().endsWith('?')) {
        actionItems.push({ text: text.trim(), assignedTo });
      } else if (text.length > 30) {
        // Longer phrases are likely complete thoughts
        actionItems.push({ text: text.trim(), assignedTo });
      }
    }
    
    return actionItems;
  }

  /**
   * Extract problems/issues mentioned in the text - only meaningful, complete problems
   */
  private extractProblems(text: string): string[] {
    const problems: string[] = [];
    const lowerText = text.toLowerCase();
    
    const problemIndicators = [
      'problem', 'issue', 'challenge', 'difficulty', 'trouble', 'error',
      'bug', 'broken', 'not working', 'failed', 'failure', 'blocked',
      'stuck', 'cannot', "can't", 'unable', 'impossible', 'wrong',
      'missing', 'lack', 'shortage', 'delay', 'late', 'overdue',
      'concern', 'worry', 'risk', 'threat', 'danger', 'down', 'responsible'
    ];
    
    // Only extract if it's a meaningful problem statement (not just a fragment)
    const hasProblemKeyword = problemIndicators.some(indicator => lowerText.includes(indicator));
    
    if (hasProblemKeyword && text.length > 15) {
      // Filter out fragments that are just descriptions (like "has black curly hairs")
      const isFragment = /^(has|is|are|was|were|he|she|it|they)\s+/i.test(text.trim()) && 
                         text.length < 30 && 
                         !lowerText.includes('problem') && 
                         !lowerText.includes('issue') && 
                         !lowerText.includes('challenge');
      
      if (!isFragment) {
        // Make sure it's a complete thought
        if (text.trim().endsWith('.') || text.trim().endsWith('!') || text.trim().endsWith('?')) {
          problems.push(text.trim());
        } else if (text.length > 40) {
          // Longer phrases are likely complete thoughts
          problems.push(text.trim());
        }
      }
    }
    
    return problems;
  }

  /**
   * Extract pain points (frustrations, inefficiencies)
   */
  private extractPainPoints(text: string): string[] {
    const painPoints: string[] = [];
    const lowerText = text.toLowerCase();
    
    const painIndicators = [
      'frustrating', 'annoying', 'inefficient', 'slow', 'waste of time',
      'complicated', 'confusing', 'difficult', 'hard to', 'struggle',
      'wish', 'hope', 'would be better', 'should be', 'need improvement',
      'not easy', 'not simple', 'too much', 'too many', 'overwhelming',
      'tedious', 'repetitive', 'manual', 'time consuming', 'bottleneck'
    ];
    
    painIndicators.forEach(indicator => {
      if (lowerText.includes(indicator) && text.length > 10) {
        painPoints.push(text);
      }
    });
    
    return painPoints;
  }

  /**
   * Extract expectations/hopes (what people want/need) - only complete, meaningful expectations
   */
  private extractExpectations(text: string): string[] {
    const expectations: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Only extract complete expectations, not fragments
    // Look for patterns that indicate a clear need/want/expectation
    const expectationPatterns = [
      /(?:want|need|expect|hope|wish|would like|looking for|seeking|require)\s+[^.!?]+(?:to|for|that|a|an|the)[^.!?]+/gi,
      /(?:should have|must have|need to have)\s+[^.!?]+/gi,
      /(?:would be great|would help|would make|would improve|would save|would reduce|would increase|would enable|would allow|would let|would support|would facilitate)\s+[^.!?]+/gi,
    ];
    
    // Only add if it's a complete, meaningful expectation (not just a fragment)
    if (text.length > 20) {
      const hasExpectationKeyword = /(?:want|need|expect|hope|wish|would like|looking for|seeking|require|should have|must have|would be great|would help|would make|would improve|would save|would reduce|would increase|would enable|would allow|would let|would support|would facilitate)/i.test(text);
      
      if (hasExpectationKeyword) {
        // Make sure it's a complete thought
        if (text.trim().endsWith('.') || text.trim().endsWith('!') || text.trim().endsWith('?')) {
          expectations.push(text.trim());
        } else if (text.length > 40) {
          // Longer phrases are likely complete thoughts
          expectations.push(text.trim());
        }
      }
    }
    
    return expectations;
  }

  /**
   * Extract productivity blockers
   */
  private extractProductivityBlockers(text: string): string[] {
    const blockers: string[] = [];
    const lowerText = text.toLowerCase();
    
    const blockerIndicators = [
      'blocking', 'blocked', 'waiting for', 'depends on', 'cannot proceed',
      'stuck', 'delayed', 'postponed', 'on hold', 'pending', 'bottleneck',
      'slowing down', 'hindering', 'preventing', 'stopping', 'interrupting',
      'distracting', 'taking too long', 'too slow', 'inefficient process'
    ];
    
    blockerIndicators.forEach(indicator => {
      if (lowerText.includes(indicator) && text.length > 10) {
        blockers.push(text);
      }
    });
    
    return blockers;
  }

  /**
   * Extract decisions made
   */
  private extractDecisions(text: string): string[] {
    const decisions: string[] = [];
    const lowerText = text.toLowerCase();
    
    const decisionIndicators = [
      'decided', 'decision', 'agreed', 'agreement', 'approved', 'approval',
      'chosen', 'selected', 'opted for', 'going with', 'will use',
      'will do', 'will implement', 'will proceed', 'will move forward',
      'finalized', 'settled on', 'concluded', 'resolved', 'determined'
    ];
    
    decisionIndicators.forEach(indicator => {
      if (lowerText.includes(indicator) && text.length > 10) {
        decisions.push(text);
      }
    });
    
    return decisions;
  }

  /**
   * Calculate speaking rate (words per minute)
   */
  private calculateSpeakingRate(text: string, start: number, end: number): number {
    const words = text.split(/\s+/).length;
    
    // If we don't have proper timing, estimate based on text length
    if (start === 0 && end === 0) {
      // Estimate: average person speaks ~150 words per minute
      // For short phrases, estimate based on word count
      if (words <= 3) return 120; // Short phrases
      if (words <= 6) return 140; // Medium phrases
      return 160; // Longer phrases
    }
    
    const durationMinutes = (end - start) / 60000; // Convert to minutes
    
    if (durationMinutes <= 0) {
      // Fallback to estimation
      if (words <= 3) return 120;
      if (words <= 6) return 140;
      return 160;
    }
    
    return Math.round(words / durationMinutes);
  }

  /**
   * Check if text is a duplicate of the last processed text
   */
  private isDuplicate(text: string): boolean {
    if (!this.lastProcessedText) {
      return false;
    }

    // Simple exact match check - only skip if text is exactly the same
    return text.toLowerCase().trim() === this.lastProcessedText.toLowerCase().trim();
  }

  /**
   * Enhanced duplicate detection against recent transcripts
   */
  private isDuplicateEnhanced(text: string): boolean {
    if (this.currentTranscripts.length === 0) {
      return false;
    }

    const currentText = text.toLowerCase().trim();
    
    // Check against the last 3 transcripts to avoid recent duplicates
    const recentTranscripts = this.currentTranscripts.slice(-3);
    
    for (const transcript of recentTranscripts) {
      const previousText = transcript.text.toLowerCase().trim();
      
      // Exact match
      if (currentText === previousText) {
        return true;
      }
      
      // Check if current text is contained in previous text (shorter version)
      if (previousText.includes(currentText) && currentText.length > 3) {
        return true;
      }
      
      // Check if previous text is contained in current text (replace shorter with longer)
      if (currentText.includes(previousText) && previousText.length > 3) {
        // Remove the shorter version
        const index = this.currentTranscripts.indexOf(transcript);
        if (index > -1) {
          this.currentTranscripts.splice(index, 1);
          console.log(`🔄 Replaced shorter transcript: "${transcript.text}" -> "${text}"`);
          return false; // Allow this to be added
        }
      }
    }
    
    return false;
  }



  /**
   * Check if one text is contained within another
   */
  private isTextContained(shortText: string, longText: string): boolean {
    // Remove punctuation and extra spaces for comparison
    const cleanShort = shortText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanLong = longText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    return cleanLong.includes(cleanShort) && cleanShort.length > 3;
  }

  /**
   * Save the current transcript to a local file using browser download
   */
  saveTranscript(): string | null {
    if (!this.currentMeetingId || this.currentTranscripts.length === 0) {
      console.warn('⚠️ No transcripts to save');
      return null;
    }

    try {
      const filename = this.generateFilename();
      const content = this.formatTranscriptContent();

      // Create blob and download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      console.log(`💾 Transcript saved: ${filename}`);
      return filename;
    } catch (error) {
      console.error('❌ Failed to save transcript:', error);
      return null;
    }
  }

  /**
   * Generate filename for the transcript
   */
  private generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `meeting-${this.currentMeetingId}-${timestamp}.txt`;
  }

  /**
   * Format transcript content in a professional format with enhanced details
   */
  private formatTranscriptContent(): string {
    const meetingInfo = this.meetingInfo!;
    const endTime = new Date();
    const duration = meetingInfo.startTime 
      ? Math.round((endTime.getTime() - meetingInfo.startTime.getTime()) / 1000 / 60)
      : 0;

    // Clean and merge transcripts before formatting
    const cleanedTranscripts = this.cleanAndMergeTranscripts();

    let content = `================================================================================
MEETING MONITOR - ENHANCED TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: ${meetingInfo.meetingId}
  Title: ${meetingInfo.title}
  Industry: ${meetingInfo.industry || 'Not specified'}
  Meeting Type: ${meetingInfo.meetingType || 'Not specified'}
  Start Time: ${meetingInfo.startTime?.toLocaleString() || 'Unknown'}
  End Time: ${endTime.toLocaleString()}
  Duration: ${duration} minutes
  Language: ${meetingInfo.language || 'English'}
  Timezone: ${meetingInfo.timezone || 'Local'}

Attendees:
${meetingInfo.attendees?.map(attendee => 
  `  - ${attendee.name} (${attendee.role})${attendee.company ? ` - ${attendee.company}` : ''}${attendee.isHost ? ' [HOST]' : ''}`
).join('\n') || '  - No attendee details available'}

Agenda:
${meetingInfo.agenda?.map(item => `  - ${item}`).join('\n') || '  - No agenda specified'}

================================================================================
CLEAN TRANSCRIPT
================================================================================

`;

    // Clean transcript section - just speaker and text with timestamps
    cleanedTranscripts.forEach((transcript) => {
      const timestamp = transcript.timestamp ? transcript.timestamp.toLocaleTimeString() : 'Unknown';
      const speakerName = transcript.speakerName || 'Unknown';
      content += `${speakerName} (timestamp: ${timestamp}): ${transcript.text}\n`;
    });

    content += `\n================================================================================
ENHANCED TRANSCRIPT WITH AI ANALYSIS
================================================================================

This section provides detailed analysis of each participant's contributions, 
helping you understand engagement levels, communication patterns, and key insights.

`;

    // Group transcripts by speaker for AI analysis
    const speakerGroups = this.groupTranscriptsBySpeaker(cleanedTranscripts);
    
    speakerGroups.forEach((group, speakerIndex) => {
      content += `[${speakerIndex + 1}] Speaker: ${group.speakerName}\n`;
      content += `Total Utterances: ${group.transcripts.length}\n`;
      
      // AI Analysis for this speaker
      const speakerAnalysis = this.analyzeSpeaker(group.transcripts);
      content += `Analysis:\n`;
      content += `  - Overall Emotion: ${speakerAnalysis.overallEmotion} (Sentiment: ${speakerAnalysis.overallSentiment.toFixed(2)})\n`;
      content += `  - Questions Asked: ${speakerAnalysis.questionsAsked}\n`;
      content += `  - Action Items: ${speakerAnalysis.actionItems.length}\n`;
      content += `  - Technical Terms: ${speakerAnalysis.technicalTerms.length}\n`;
      content += `  - Average Speaking Rate: ${speakerAnalysis.avgSpeakingRate} WPM\n`;
      content += `  - Average Audio Quality: ${Math.round(speakerAnalysis.avgAudioQuality * 100)}%\n`;
      
      if (speakerAnalysis.technicalTerms.length > 0) {
        content += `  - Technical Terms Used: ${speakerAnalysis.technicalTerms.join(', ')}\n`;
      }
      
      if (speakerAnalysis.actionItems.length > 0) {
        content += `  - Action Items: ${speakerAnalysis.actionItems.join('; ')}\n`;
      }
      
      content += `\n`;
    });

    // Summary section
    content += `================================================================================
MEETING SUMMARY & KEY METRICS
================================================================================

Engagement Overview:
  - Total Utterances: ${cleanedTranscripts.length}
  - Active Participants: ${new Set(cleanedTranscripts.map(t => t.speakerName)).size}
  - Questions Asked: ${cleanedTranscripts.filter(t => t.isQuestion).length}
  - Action Items Identified: ${cleanedTranscripts.filter(t => t.followUpRequired).length}
  - Technical Terms Mentioned: ${new Set(cleanedTranscripts.flatMap(t => t.technicalTerms || [])).size}

Communication Sentiment:
  - Positive: ${cleanedTranscripts.filter(t => t.emotion === 'positive' || t.emotion === 'excited').length} utterances
  - Neutral: ${cleanedTranscripts.filter(t => t.emotion === 'neutral').length} utterances
  - Negative/Concerned: ${cleanedTranscripts.filter(t => t.emotion === 'negative' || t.emotion === 'concerned').length} utterances

Topics & Themes:
${(() => {
    const topics = Array.from(new Set(cleanedTranscripts.map(t => t.topic).filter(Boolean)));
    if (topics.length > 0) {
      return topics.map(topic => 
        `  - ${topic!.charAt(0).toUpperCase() + topic!.slice(1)}: ${cleanedTranscripts.filter(t => t.topic === topic).length} mentions`
      ).join('\n');
    }
    return '  - General discussion';
  })()}

Technical Terms & Jargon:
${Array.from(new Set(cleanedTranscripts.flatMap(t => t.technicalTerms || []))).slice(0, 10).map(term => 
  `  - ${term.charAt(0).toUpperCase() + term.slice(1)}: ${cleanedTranscripts.filter(t => t.technicalTerms?.includes(term)).length} mentions`
).join('\n') || '  - No specific technical terms detected'}

Action Items Requiring Follow-up:
${(() => {
    const actionItemsData = cleanedTranscripts.flatMap(t => (t as any).actionItemsData || []);
    const uniqueActionItems = Array.from(new Map(actionItemsData.map(item => [item.text, item])).values());
    
    if (uniqueActionItems.length > 0) {
      return uniqueActionItems.map((item, index) => {
        const assignedPart = item.assignedTo ? ` (Assigned to: ${item.assignedTo})` : '';
        return `  ${index + 1}. ${item.text}${assignedPart}`;
      }).join('\n');
    }
    return '  - No action items requiring immediate follow-up identified';
  })()}

Questions Asked During Meeting:
${cleanedTranscripts.filter(t => t.isQuestion).length > 0
  ? cleanedTranscripts.filter(t => t.isQuestion).map((transcript, index) => 
      `  ${index + 1}. ${transcript.speakerName}: "${transcript.text}"`
    ).join('\n')
  : '  - No questions were asked during the meeting'}

================================================================================
BUSINESS INSIGHTS & ANALYSIS
================================================================================

Problems & Issues Identified:
${Array.from(new Set(cleanedTranscripts.flatMap(t => (t as any).problems || []))).map((problem, index) => 
  `  ${index + 1}. ${problem}`
).join('\n') || '  - No specific problems mentioned'}

Pain Points & Frustrations:
${Array.from(new Set(cleanedTranscripts.flatMap(t => (t as any).painPoints || []))).map((pain, index) => 
  `  ${index + 1}. ${pain}`
).join('\n') || '  - No pain points identified'}

Expectations & Needs Expressed:
${(() => {
    const expectations = Array.from(new Set(cleanedTranscripts.flatMap(t => (t as any).expectations || [])));
    // Filter out very short or incomplete expectations
    const meaningfulExpectations = expectations.filter(exp => exp.length > 20 && !exp.match(/^(so|and|but|or|the|a|an)\s/i));
    
    if (meaningfulExpectations.length > 0) {
      return meaningfulExpectations.map((expectation, index) => 
        `  ${index + 1}. ${expectation}`
      ).join('\n');
    }
    return '  - No specific expectations or needs were explicitly mentioned';
  })()}

Productivity Blockers:
${Array.from(new Set(cleanedTranscripts.flatMap(t => (t as any).productivityBlockers || []))).map((blocker, index) => 
  `  ${index + 1}. ${blocker}`
).join('\n') || '  - No productivity blockers identified'}

Decisions Made:
${Array.from(new Set(cleanedTranscripts.flatMap(t => (t as any).decisions || []))).map((decision, index) => 
  `  ${index + 1}. ${decision}`
).join('\n') || '  - No explicit decisions documented'}

Key Business Takeaways:
${this.generateBusinessTakeaways(cleanedTranscripts)}

================================================================================
Transcript generated on: ${endTime.toLocaleString()}
Enhanced with AI analysis for Meeting Monitor
================================================================================`;

    return content;
  }

  /**
   * Clean and merge similar consecutive transcripts
   */
  private cleanAndMergeTranscripts(): TranscriptEntry[] {
    if (this.currentTranscripts.length <= 1) {
      return this.currentTranscripts;
    }

    const merged: TranscriptEntry[] = [];
    let current = this.currentTranscripts[0];

    for (let i = 1; i < this.currentTranscripts.length; i++) {
      const next = this.currentTranscripts[i];
      
      // If current and next are very similar, merge them
      if (this.areTranscriptsSimilar(current.text, next.text)) {
        // Keep the longer/more complete version
        current = current.text.length >= next.text.length ? current : next;
      } else {
        // Add current to merged array and move to next
        merged.push(current);
        current = next;
      }
    }
    
    // Add the last transcript
    merged.push(current);
    
    return merged;
  }

  /**
   * Check if two transcripts are similar enough to merge
   */
  private areTranscriptsSimilar(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.6; // 60% similarity threshold for merging
  }

  /**
   * Group transcripts by time intervals
   */
  private groupTranscriptsByTime(): Array<{
    startTime: number;
    transcripts: TranscriptEntry[];
  }> {
    const groups: Array<{
      startTime: number;
      transcripts: TranscriptEntry[];
    }> = [];
    
    const intervalMs = 30000; // 30 seconds

    this.currentTranscripts.forEach((transcript, index) => {
      // Use relative time based on transcript order if timestamp is not reliable
      const timestamp = transcript.timestamp?.getTime() || (index * 5000); // 5 seconds apart
      const groupIndex = Math.floor(timestamp / intervalMs);
      const groupStartTime = groupIndex * intervalMs;
      
      let group = groups.find(g => g.startTime === groupStartTime);
      if (!group) {
        group = { startTime: groupStartTime, transcripts: [] };
        groups.push(group);
      }
      
      group.transcripts.push(transcript);
    });

    return groups.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Format time label for transcript sections
   */
  private formatTimeLabel(timestamp: number): string {
    const minutes = Math.floor(timestamp / 60000);
    const seconds = Math.floor((timestamp % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Group transcripts by speaker
   */
  private groupTranscriptsBySpeaker(transcripts: TranscriptEntry[]): Array<{
    speakerName: string;
    transcripts: TranscriptEntry[];
  }> {
    const groups: { [key: string]: TranscriptEntry[] } = {};
    
    transcripts.forEach(transcript => {
      const speakerName = transcript.speakerName || 'Unknown';
      if (!groups[speakerName]) {
        groups[speakerName] = [];
      }
      groups[speakerName].push(transcript);
    });
    
    return Object.entries(groups).map(([speakerName, transcripts]) => ({
      speakerName,
      transcripts
    }));
  }

  /**
   * Analyze a group of transcripts for a speaker
   */
  private analyzeSpeaker(transcripts: TranscriptEntry[]): {
    overallEmotion: string;
    overallSentiment: number;
    questionsAsked: number;
    actionItems: string[];
    technicalTerms: string[];
    avgSpeakingRate: number;
    avgAudioQuality: number;
  } {
    const emotions = transcripts.map(t => t.emotion || 'neutral');
    const sentiments = transcripts.map(t => t.sentimentScore || 0);
    const questionsAsked = transcripts.filter(t => t.isQuestion).length;
    const actionItems = transcripts.flatMap(t => t.actionItems || []);
    const technicalTerms = Array.from(new Set(transcripts.flatMap(t => t.technicalTerms || [])));
    const speakingRates = transcripts.map(t => t.speakingRate || 0).filter(rate => rate > 0);
    const audioQualities = transcripts.map(t => t.audioQuality || 0);
    
    // Calculate overall emotion (most common)
    const emotionCounts: { [key: string]: number } = {};
    emotions.forEach(emotion => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });
    const overallEmotion = Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'neutral';
    
    // Calculate average sentiment
    const overallSentiment = sentiments.length > 0 
      ? sentiments.reduce((sum, val) => sum + val, 0) / sentiments.length 
      : 0;
    
    // Calculate average speaking rate
    const avgSpeakingRate = speakingRates.length > 0
      ? Math.round(speakingRates.reduce((sum, rate) => sum + rate, 0) / speakingRates.length)
      : 0;
    
    // Calculate average audio quality
    const avgAudioQuality = audioQualities.length > 0
      ? audioQualities.reduce((sum, quality) => sum + quality, 0) / audioQualities.length
      : 0;
    
    return {
      overallEmotion,
      overallSentiment,
      questionsAsked,
      actionItems,
      technicalTerms,
      avgSpeakingRate,
      avgAudioQuality
    };
  }

  /**
   * End the current meeting session
   */
  endMeeting(): string | null {
    const filename = this.saveTranscript();
    this.currentMeetingId = null;
    this.currentTranscripts = [];
    this.lastProcessedText = '';
    this.meetingInfo = null;
    return filename;
  }

  /**
   * Get current transcript count
   */
  getTranscriptCount(): number {
    return this.currentTranscripts.length;
  }

  /**
   * Get current meeting ID
   */
  getCurrentMeetingId(): string | null {
    return this.currentMeetingId;
  }

  /**
   * Generate business takeaways summary
   */
  private generateBusinessTakeaways(transcripts: TranscriptEntry[]): string {
    const problems = Array.from(new Set(transcripts.flatMap(t => (t as any).problems || [])));
    const painPoints = Array.from(new Set(transcripts.flatMap(t => (t as any).painPoints || [])));
    const expectations = Array.from(new Set(transcripts.flatMap(t => (t as any).expectations || [])));
    const blockers = Array.from(new Set(transcripts.flatMap(t => (t as any).productivityBlockers || [])));
    const decisions = Array.from(new Set(transcripts.flatMap(t => (t as any).decisions || [])));

    const takeaways: string[] = [];

    if (problems.length > 0) {
      takeaways.push(`• ${problems.length} problem(s) identified that need attention`);
    }
    if (painPoints.length > 0) {
      takeaways.push(`• ${painPoints.length} pain point(s) highlighted - opportunities for improvement`);
    }
    if (expectations.length > 0) {
      takeaways.push(`• ${expectations.length} expectation(s) expressed - indicates desired outcomes`);
    }
    if (blockers.length > 0) {
      takeaways.push(`• ${blockers.length} productivity blocker(s) found - may require process changes`);
    }
    if (decisions.length > 0) {
      takeaways.push(`• ${decisions.length} decision(s) made - should be documented and followed up`);
    }
    if (transcripts.filter(t => t.isQuestion).length > 0) {
      takeaways.push(`• ${transcripts.filter(t => t.isQuestion).length} question(s) asked - may indicate knowledge gaps or need for clarification`);
    }

    return takeaways.length > 0 
      ? takeaways.map((t, i) => `  ${i + 1}. ${t}`).join('\n')
      : '  - Meeting completed with standard discussion flow';
  }

  /**
   * Get all transcripts for QnA (returns full transcript text)
   */
  getAllTranscripts(): TranscriptEntry[] {
    return [...this.currentTranscripts];
  }

  /**
   * Get transcript text for QnA search
   */
  getTranscriptText(): string {
    return this.currentTranscripts
      .map(t => `${t.speakerName || 'Speaker'}: ${t.text}`)
      .join('\n');
  }
}

// Export singleton instance
const localTranscriptStorageClient = new LocalTranscriptStorageClient();
export default localTranscriptStorageClient;
