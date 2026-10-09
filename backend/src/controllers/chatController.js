const Document = require('../models/Document');
const { generateContentWithRetry, getKeyCount } = require('../utils/geminiKeyManager');

/**
 * @desc    Chat with AI Threat Intelligence Assistant regarding a document
 * @route   POST /api/chat or POST /api/ai/chat
 * @access  Private (JWT protected)
 */
const chatWithDocument = async (req, res) => {
  try {
    const { documentId, message, prompt, question, history = [] } = req.body;
    const userMessage = (message || prompt || question || '').trim();

    if (!documentId) {
      return res.status(400).json({ message: 'documentId is required' });
    }

    if (!userMessage) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    // 1. Fetch document from database
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // 2. Check if API keys are available
    if (getKeyCount() === 0) {
      return res.status(500).json({
        message: 'No valid Gemini API keys configured on backend',
      });
    }

    const docText = document.extractedText || '';
    const truncatedText = docText.length > 20000 ? docText.slice(0, 20000) + '...[truncated]' : docText;

    // 3. Format previous conversation context if provided
    let conversationContext = '';
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6); // last 6 exchanges
      conversationContext = recentHistory
        .map((h) => `${h.role === 'user' ? 'Analyst' : 'AI Assistant'}: ${h.content || h.text || ''}`)
        .join('\n');
    }

    // 4. Build prompt
    const fullPrompt = `You are a Senior Cybersecurity Threat Intelligence Analyst assistant in a Security Operations Center (SOC).
Your mission is to analyze threat reports and assist human analysts by answering questions accurately, concisely, and professionally.

--- DOCUMENT INFORMATION ---
Title: ${document.title}
File: ${document.fileName}

--- REPORT CONTENT ---
${truncatedText || 'No text extracted from this document.'}

--- CONVERSATION HISTORY ---
${conversationContext || 'None'}

--- CURRENT ANALYST INQUIRY ---
${userMessage}

--- RESPONSE GUIDELINES ---
1. Base your answer primarily on the threat report provided above.
2. If the report specifies entities (Threat Actors, CVEs, Malware, Target Countries), highlight them clearly.
3. If the answer is not mentioned in the report, explicitly clarify that, then provide general cybersecurity guidance if helpful.
4. Keep answers concise, actionable, and formatted using clean bullet points where appropriate.`;

    // 5. Execute with Gemini Key Pool & bounded retries
    const result = await generateContentWithRetry(fullPrompt, {
      modelName: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    });

    const reply = result.response.text();

    return res.status(200).json({
      reply,
      message: reply,
      documentId,
    });
  } catch (error) {
    console.error('[ChatController] Error generating chat response:', error.message || error);
    return res.status(500).json({
      message: 'Error communicating with AI assistant: ' + (error.message || 'Internal server error'),
    });
  }
};

module.exports = {
  chatWithDocument,
};
