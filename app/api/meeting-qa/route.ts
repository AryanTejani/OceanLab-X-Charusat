import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  try {
    const { question, meetingId, transcripts } = await request.json();

    if (!question || !meetingId) {
      return NextResponse.json(
        { error: 'Question and meetingId are required' },
        { status: 400 }
      );
    }

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json({
        answer: 'No meeting transcript available yet. Please wait for some discussion to occur before asking questions.',
      });
    }

    // Get Gemini API key with detailed logging
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const apiKeySource = process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : (process.env.NEXT_PUBLIC_GEMINI_API_KEY ? 'NEXT_PUBLIC_GEMINI_API_KEY' : 'NONE');
    
    console.log('🔍 [GEMINI DEBUG] API Key Check:');
    console.log('  - Source:', apiKeySource);
    console.log('  - Present:', !!geminiApiKey);
    console.log('  - Length:', geminiApiKey?.length || 0);
    console.log('  - First 10 chars:', geminiApiKey ? `${geminiApiKey.substring(0, 10)}...` : 'N/A');
    console.log('  - Last 10 chars:', geminiApiKey && geminiApiKey.length > 10 ? `...${geminiApiKey.substring(geminiApiKey.length - 10)}` : 'N/A');
    
    if (!geminiApiKey || geminiApiKey.trim().length === 0) {
      console.log('❌ [GEMINI DEBUG] No API key found - using fallback');
      // Fallback to simple QnA if Gemini is not configured
      return NextResponse.json({
        answer: generateSimpleAnswer(question, transcripts),
      });
    }

    // Format transcript for Gemini
    const transcriptText = transcripts
      .map((t: any, index: number) => {
        const timestamp = t.timestamp 
          ? new Date(t.timestamp).toLocaleTimeString() 
          : `[${index + 1}]`;
        return `[${timestamp}] ${t.speakerName || 'Speaker'}: ${t.text}`;
      })
      .join('\n');

    // Initialize Gemini - fetch available models from API first
    let modelName = 'gemini-2.5-flash'; // Default fallback (user requested)
    let model;
    
    try {
      console.log('🔍 [GEMINI DEBUG] Fetching available models from API...');
      const modelsResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
      );
      
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        const availableModels = modelsData.models || [];
        const modelNames = availableModels.map((m: any) => m.name).filter(Boolean);
        console.log('📋 [GEMINI DEBUG] Available models:', modelNames.join(', '));
        
        // Find a model that supports generateContent - prefer "lite" models for better quota
        // Priority: lite models > flash models > pro models
        const findModel = (patterns: string[]) => {
          for (const pattern of patterns) {
            const model = availableModels.find((m: any) => 
              m.name && 
              m.name.includes(pattern) &&
              m.supportedGenerationMethods?.includes('generateContent')
            );
            if (model) return model;
          }
          return null;
        };
        
        // Priority: gemini-2.5-flash first (user requested)
        let textModel = findModel(['gemini-2.5-flash']);
        
        // If not found, try other flash models
        if (!textModel) {
          textModel = findModel(['flash']);
        }
        
        // Then try lite models (better quota limits)
        if (!textModel) {
          textModel = findModel(['flash-lite', 'lite']);
        }
        
        // Last resort: try pro models
        if (!textModel) {
          textModel = findModel(['pro', 'gemini']);
        }
        
        if (textModel) {
          // Remove 'models/' prefix if present
          modelName = textModel.name.replace(/^models\//, '');
          console.log('✅ [GEMINI DEBUG] Selected model:', modelName);
          console.log('  - Model supports:', textModel.supportedGenerationMethods?.join(', ') || 'N/A');
        } else {
          console.log('⚠️ [GEMINI DEBUG] No suitable model found, using default:', modelName);
        }
      } else {
        console.log('⚠️ [GEMINI DEBUG] Could not fetch models list, using default:', modelName);
        console.log('  - Response status:', modelsResponse.status);
      }
    } catch (listError: any) {
      console.log('⚠️ [GEMINI DEBUG] Error fetching models, using default:', modelName);
      console.log('  - Error:', listError.message);
    }
    
    console.log('🔍 [GEMINI DEBUG] Initializing Gemini:');
    console.log('  - Model:', modelName);
    console.log('  - Transcript length:', transcriptText.length, 'characters');
    console.log('  - Transcript entries:', transcripts.length);
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    model = genAI.getGenerativeModel({ model: modelName });

    // Create a comprehensive prompt
    const prompt = `You are an intelligent meeting assistant. Your job is to answer questions about a meeting transcript in a natural, conversational, and helpful way.

IMPORTANT RULES:
1. ONLY answer based on the meeting transcript provided below. Do NOT make up information.
2. If the question cannot be answered from the transcript, politely say so.
3. Be natural and conversational - avoid robotic responses.
4. Provide specific details when available (who said what, when, etc.).
5. Summarize key points when asked for summaries.
6. Be concise but informative.

MEETING TRANSCRIPT:
${transcriptText}

USER QUESTION: ${question}

Please provide a helpful, natural answer based ONLY on the transcript above. If the question cannot be answered from the transcript, politely explain that the information is not available in the meeting discussion.`;

    try {
      // Log detailed request information
      console.log('🔍 [GEMINI DEBUG] Making API request...');
      console.log('📤 [GEMINI DEBUG] Request Details:');
      console.log('  - API Endpoint: https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent');
      console.log('  - Method: POST');
      console.log('  - Model:', modelName);
      console.log('  - API Key: ' + geminiApiKey.substring(0, 10) + '...' + geminiApiKey.substring(geminiApiKey.length - 5) + ' (masked)');
      console.log('  - Request Body Structure:');
      console.log('    {');
      console.log('      "contents": [{');
      console.log('        "parts": [{');
      console.log('          "text": "<prompt text>"');
      console.log('        }]');
      console.log('      }]');
      console.log('    }');
      console.log('  - Prompt Length:', prompt.length, 'characters');
      console.log('  - Prompt Preview (first 200 chars):', prompt.substring(0, 200) + '...');
      console.log('  - Prompt Preview (last 100 chars):', '...' + prompt.substring(prompt.length - 100));
      console.log('  - Transcript Entries:', transcripts.length);
      console.log('  - User Question:', question);
      console.log('  - Full Request URL: https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + geminiApiKey.substring(0, 10) + '...');
      
      const startTime = Date.now();
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text();
      const duration = Date.now() - startTime;

      console.log('✅ [GEMINI DEBUG] Success:');
      console.log('  - Response time:', duration, 'ms');
      console.log('  - Answer length:', answer.length, 'characters');
      console.log('  - Response preview (first 200 chars):', answer.substring(0, 200) + (answer.length > 200 ? '...' : ''));
      console.log('  - Full response available:', answer.length > 0);

      return NextResponse.json({ answer });
    } catch (geminiError: any) {
      // Check error type first to reduce logging for known quota issues
      const status = geminiError?.status;
      const message = geminiError?.message || '';
      const isQuotaError = status === 429 || 
                          message?.toLowerCase().includes('quota') ||
                          message?.toLowerCase().includes('rate limit') ||
                          message?.toLowerCase().includes('too many requests');
      
      // Log request details in error case
      console.error('📤 [GEMINI DEBUG] Failed Request Details:');
      console.error('  - API Endpoint: https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent');
      console.error('  - Method: POST');
      console.error('  - Model:', modelName);
      console.error('  - Prompt Length:', prompt.length, 'characters');
      
      // Only log full details for non-quota errors (quota errors are expected and handled)
      if (!isQuotaError) {
        console.error('❌ [GEMINI DEBUG] Full Error Details:');
        console.error('  - Error Type:', geminiError?.constructor?.name || typeof geminiError);
        console.error('  - Status Code:', status || 'N/A');
        console.error('  - Status Text:', geminiError?.statusText || 'N/A');
        console.error('  - Error Message:', message || 'N/A');
        console.error('  - Error Details:', geminiError?.errorDetails || 'N/A');
        console.error('  - Full Error:', JSON.stringify(geminiError, Object.getOwnPropertyNames(geminiError), 2));
      } else {
        // Brief log for quota errors but still show request details
        console.log('⚠️ [GEMINI DEBUG] API quota exceeded - using fallback QnA');
        console.log('  - Requested URL: https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent');
        console.log('  - Status: 429 Too Many Requests');
      }
      
      // Error details (already extracted above for quota check)
      const errorDetails = geminiError?.errorDetails || '';
      
      const isAuthError = status === 401 || 
                         status === 403 ||
                         message?.toLowerCase().includes('api key') ||
                         message?.toLowerCase().includes('authentication') ||
                         message?.toLowerCase().includes('unauthorized') ||
                         message?.toLowerCase().includes('forbidden');
      
      const isInvalidModel = (status === 400 || status === 404) && 
                            (message?.toLowerCase().includes('model') || 
                             message?.toLowerCase().includes('invalid') ||
                             message?.toLowerCase().includes('not found') ||
                             message?.toLowerCase().includes('not supported'));
      
      // Only log detailed classification for non-quota errors
      if (!isQuotaError) {
        console.error('🔍 [GEMINI DEBUG] Error Classification:');
        console.error('  - Is Quota Error:', isQuotaError);
        console.error('  - Is Auth Error:', isAuthError);
        console.error('  - Is Invalid Model:', isInvalidModel);
      }
      
      // Determine the actual issue
      let errorReason = 'Unknown error';
      if (isAuthError) {
        errorReason = 'API key authentication failed - check if the key is valid and active';
      } else if (isQuotaError) {
        errorReason = 'API quota/rate limit exceeded';
      } else if (isInvalidModel) {
        errorReason = 'Invalid model name or model not available';
      } else if (status) {
        errorReason = `HTTP ${status}: ${message || 'Unknown error'}`;
      } else {
        errorReason = message || 'Unknown error occurred';
      }
      
      if (!isQuotaError) {
        console.error('  - Determined Reason:', errorReason);
      }
      
      // Always fallback to simple QnA
      const simpleAnswer = generateSimpleAnswer(question, transcripts);
      
      // Only include debug info in development mode
      const response: any = { answer: simpleAnswer };
      
      if (process.env.NODE_ENV === 'development') {
        response.debug = {
          status,
          message: message.substring(0, 200), // Truncate long messages
          errorType: isAuthError ? 'AUTH_ERROR' : isQuotaError ? 'QUOTA_ERROR' : isInvalidModel ? 'INVALID_MODEL' : 'UNKNOWN_ERROR',
          errorReason
        };
      } else if (isQuotaError) {
        // In production, only show a user-friendly note for quota errors
        response.note = 'Using basic QnA mode. Enhanced AI responses are temporarily unavailable due to API quota limits.';
      }
      
      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('QnA API error:', error);
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    );
  }
}

// Fallback simple QnA function
function generateSimpleAnswer(question: string, transcripts: any[]): string {
  const lowerQuestion = question.toLowerCase();
  const transcriptText = transcripts
    .map((t: any) => `${t.speakerName || 'Speaker'}: ${t.text}`)
    .join('\n');

  // Extract keywords from question
  const questionWords = lowerQuestion
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);

  // Find relevant transcripts
  const relevantTranscripts = transcripts.filter(transcript => {
    const lowerText = transcript.text.toLowerCase();
    return questionWords.some(word => lowerText.includes(word));
  });

  if (relevantTranscripts.length === 0) {
    // Handle "what has been discussed" or "what was discussed"
    if (lowerQuestion.includes('what') && (lowerQuestion.includes('discuss') || lowerQuestion.includes('discussion'))) {
      const speakerCount = new Set(transcripts.map(t => t.speakerName)).size;
      const questionCount = transcripts.filter(t => t.isQuestion).length;
      const actionCount = transcripts.filter(t => t.followUpRequired).length;
      const mainTopics = Array.from(new Set(transcripts.map(t => (t as any).topic).filter(Boolean))).slice(0, 5);
      
      // Get key discussion points from the actual transcript
      const keyPoints: string[] = [];
      transcripts.forEach((t, idx) => {
        if (t.text.length > 20 && idx < 10) {
          keyPoints.push(t.text);
        }
      });
      
      let answer = `The meeting involved ${speakerCount} participant(s) with ${transcripts.length} total utterances. `;
      
      if (keyPoints.length > 0) {
        answer += `Key discussion points include: ${keyPoints.slice(0, 3).join('; ')}. `;
      }
      
      if (mainTopics.length > 0) {
        answer += `Main topics covered: ${mainTopics.join(', ')}. `;
      }
      
      answer += `${questionCount} question(s) were asked, and ${actionCount} action item(s) were identified.`;
      
      return answer;
    }

    // Handle "what is the main thing" or "main discussion"
    if (lowerQuestion.includes('main') && (lowerQuestion.includes('thing') || lowerQuestion.includes('discussion') || lowerQuestion.includes('point'))) {
      // Get the main topics and key points
      const mainTopics = Array.from(new Set(transcripts.map(t => (t as any).topic).filter(Boolean))).slice(0, 3);
      const problems = transcripts.flatMap(t => (t as any).problems || []).slice(0, 2);
      const decisions = transcripts.flatMap(t => (t as any).decisions || []).slice(0, 2);
      const actionItems = transcripts.flatMap(t => (t as any).actionItemsData || []).slice(0, 2);
      
      let answer = 'The main discussion focused on: ';
      const points: string[] = [];
      
      if (mainTopics.length > 0) {
        points.push(`topics like ${mainTopics.join(', ')}`);
      }
      if (problems.length > 0) {
        points.push(`addressing problems such as "${problems[0]}"`);
      }
      if (decisions.length > 0) {
        points.push(`making decisions including "${decisions[0]}"`);
      }
      if (actionItems.length > 0) {
        points.push(`action items like "${actionItems[0].text}"`);
      }
      
      if (points.length > 0) {
        answer += points.join(', ') + '.';
      } else {
        // Fallback to actual transcript content
        const meaningfulTranscripts = transcripts.filter(t => t.text.length > 15).slice(0, 3);
        if (meaningfulTranscripts.length > 0) {
          answer = `The main discussion points were: ${meaningfulTranscripts.map(t => `"${t.text}"`).join('; ')}.`;
        } else {
          answer = 'The meeting covered various discussion points throughout the session.';
        }
      }
      
      return answer;
    }

    // Handle summary requests
    if (lowerQuestion.includes('summary') || lowerQuestion.includes('overview') || lowerQuestion.includes('brief')) {
      const speakerCount = new Set(transcripts.map(t => t.speakerName)).size;
      const questionCount = transcripts.filter(t => t.isQuestion).length;
      const actionCount = transcripts.filter(t => t.followUpRequired).length;
      const mainTopics = Array.from(new Set(transcripts.map(t => (t as any).topic).filter(Boolean))).slice(0, 5);
      
      return `Meeting Summary: ${speakerCount} participant(s) engaged in discussion with ${transcripts.length} total utterances. ${questionCount} question(s) were asked, and ${actionCount} action item(s) were identified. Main topics discussed: ${mainTopics.join(', ') || 'general discussion'}.`;
    }

    return 'I could not find specific information in the meeting transcript to answer your question. Please try asking about what was discussed, problems mentioned, decisions made, or action items.';
  }

  // Build answer from relevant transcripts
  if (lowerQuestion.includes('who said') || lowerQuestion.includes('who mention')) {
    const mentionedSpeakers = Array.from(new Set(relevantTranscripts.map(t => t.speakerName)));
    const quotes = relevantTranscripts.slice(0, 3).map(t => 
      `${t.speakerName}: "${t.text}"`
    );
    return `${mentionedSpeakers.join(' and ')} mentioned this. ${quotes.join(' ')}`;
  }

  // Default: return relevant information in a natural way
  const topRelevant = relevantTranscripts.slice(0, 5);
  const context = topRelevant.map(t => `${t.speakerName} mentioned: "${t.text}"`).join(' ');
  
  return `Based on the meeting discussion: ${context}`;
}
