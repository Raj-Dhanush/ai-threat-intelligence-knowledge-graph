const Document = require('../models/Document');
const { generateContent, parseJsonResponse, getKeyStats } = require('../utils/aiProvider');

/**
 * @desc    Generate AI threat intelligence summary from document
 * @route   POST /api/ai/summary
 * @access  Private
 */
const generateSummary = async (req, res) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ message: 'documentId is required in request body' });
    }

    // 1. Fetch document from MongoDB
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // 2. Check for extracted text
    const extractedText = document.extractedText;
    if (!extractedText || extractedText.trim() === '') {
      return res.status(400).json({ message: 'Document has no extracted text to analyze' });
    }

    // 3. Verify at least one AI provider is available
    const { gemini, groq } = getKeyStats();
    if (gemini === 0 && groq === 0) {
      return res.status(500).json({
        message: 'No AI API keys are configured. Please set GEMINI_API_KEY_1..5 or GROQ_API_KEY_1..5 in backend/.env',
      });
    }

    // 4. Build analysis prompt
    const prompt = `You are a cybersecurity threat intelligence analyst.
Analyze the following threat report and return:
1. Risk Level (LOW/MEDIUM/HIGH)
2. Threat Actors
3. Malware
4. Vulnerabilities
5. Target Countries
6. Executive Summary

Return ONLY a JSON object strictly following this structure:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "threatActors": ["actor1", "actor2"],
  "malware": ["malware1", "malware2"],
  "vulnerabilities": ["CVE-...", ...],
  "countries": ["country1", ...],
  "summary": "Executive summary text here"
}

Threat Report:
${extractedText}`;

    // 5. Generate with Gemini (primary) / Groq (fallback)
    const responseText = await generateContent(prompt);

    // 6. Parse JSON response
    let parsedData;
    try {
      parsedData = parseJsonResponse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI output as JSON:', responseText);
      return res.status(500).json({
        message: 'Failed to parse AI output into valid JSON',
        rawOutput: responseText,
      });
    }

    return res.status(200).json({
      riskLevel: parsedData.riskLevel || 'MEDIUM',
      threatActors: parsedData.threatActors || [],
      malware: parsedData.malware || [],
      vulnerabilities: parsedData.vulnerabilities || [],
      countries: parsedData.countries || [],
      summary: parsedData.summary || '',
    });
  } catch (error) {
    console.error('AI summary generation error:', error.message || error);
    return res.status(500).json({
      message: 'Error generating AI summary: ' + (error.message || 'Internal server error'),
    });
  }
};

module.exports = { generateSummary };
