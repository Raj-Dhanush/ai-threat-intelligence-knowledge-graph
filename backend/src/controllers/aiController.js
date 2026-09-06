const { GoogleGenerativeAI } = require('@google/generative-ai');
const Document = require('../models/Document');

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

    // 1. Fetch document from MongoDB using Document model
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // 2. Read document.extractedText
    const extractedText = document.extractedText;
    if (!extractedText || extractedText.trim() === '') {
      return res.status(400).json({ message: 'Document has no extracted text to analyze' });
    }

    // 3. Verify GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
    if (!apiKey) {
      return res.status(500).json({
        message: 'GEMINI_API_KEY is not configured in backend environment variables',
      });
    }

    // 4. Initialize Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    // 5. Construct prompt as specified
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

    // 6. Generate content from Gemini
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 7. Parse and return JSON response
    let parsedData;
    try {
      // Remove any markdown code fences if returned
      const cleanJson = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      parsedData = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Failed to parse Gemini output as JSON:', responseText);
      return res.status(500).json({
        message: 'Failed to parse AI output into valid JSON',
        rawOutput: responseText,
      });
    }

    // Return standardized response matching the requirements
    return res.status(200).json({
      riskLevel: parsedData.riskLevel || 'MEDIUM',
      threatActors: parsedData.threatActors || [],
      malware: parsedData.malware || [],
      vulnerabilities: parsedData.vulnerabilities || [],
      countries: parsedData.countries || [],
      summary: parsedData.summary || '',
    });
  } catch (error) {
    console.error('AI summary generation error:', error);
    return res.status(500).json({
      message: 'Error generating AI summary: ' + (error.message || 'Internal server error'),
    });
  }
};

module.exports = { generateSummary };
