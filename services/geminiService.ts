import { GoogleGenAI, Modality } from "@google/genai";
import { ProjectInfo, ShowcaseScene, ProjectType, Character, LocationAsset, Poster, ScriptBeat, TwistOption, BudgetLineItem } from "../types";
import { INDIAN_CINEMA_BEATS } from "../constants";

const getAIClient = () => {
  // Priority: 1. Environment Variable, 2. Local Storage
  const apiKey = process.env.API_KEY || localStorage.getItem('gemini_api_key') || "";
  if (!apiKey) {
    console.error("API Key is missing. Prompting user...");
    throw new Error("API Key is missing. Please add it in Settings.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper for Gemini Image Extraction (generateContent)
const extractGeminiImageResponse = (response: any): string | null => {
  // Check candidates list
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
  }
  return null;
};

// --- TEXT GENERATION FUNCTIONS ---

export const generateSlideContent = async (
  project: ProjectInfo,
  slideTitle: string,
  currentContent: string
): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";
    
    const langInstruction = project.language === 'ml' 
      ? "Write the output content strictly in Malayalam language (മലയാളം)." 
      : "Write the output in English.";

    let role = "expert film producer";
    if (project.projectType === ProjectType.STARTUP_PITCH) role = "venture capital consultant";
    if (project.projectType === ProjectType.DOCUMENTARY) role = "documentary researcher";

    let prompt = `
      You are an ${role} helping to write a pitch deck.
      
      Project Details:
      Type: ${project.projectType}
      Title: ${project.title}
      Genre/Category: ${project.genre}
      Logline: ${project.logline}
      Creator: ${project.director}
      
      FULL CONTEXT (Script/Plan):
      ${project.fullScript ? project.fullScript.substring(0, 20000) : "No full details provided, use logline."}

      Task: Write professional, compelling content for a pitch deck slide titled "${slideTitle}".
      
      Context/Existing Content: ${currentContent || "None provided yet."}

      Requirements:
      - ${langInstruction}
      - Keep it concise (under 150 words).
      - Use industry-standard terminology for ${project.projectType}.
      - Make it persuasive.
      - Return ONLY the content text, no markdown formatting like **bold** headers if possible.
    `;

    if (slideTitle.includes("Budget") || slideTitle.includes("ROI") || slideTitle.includes("Financial")) {
      prompt += `
        SPECIAL INSTRUCTION: Analyze the project complexity. Estimate a realistic budget/financials.
        For Movies: Estimate in Crores (₹ Cr) for Indian Context.
        For Startups: Estimate in USD/INR ($ or ₹) for seed/Series A funding.
        Break down costs appropriately.
      `;
    }

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error: any) {
    console.error("Content Gen Error:", error);
    return "Error generating content. Please check your API Key in Settings.";
  }
};

export const refineScript = async (
  currentScript: string, 
  instruction: string,
  language: 'en' | 'ml' = 'en'
): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const langDirective = language === 'ml' 
      ? "STRICTLY OUTPUT IN MALAYALAM (മലയാളം). Do not translate to English technical terms like INT/EXT unless typical for the format. If the input is Malayalam, keep it Malayalam."
      : "Output in English.";

    const prompt = `
      You are a professional Screenwriter and Script Doctor compatible with International and Indian (Mollywood) standards.
      
      Language Requirement: ${langDirective}
      
      Current Script Segment:
      ${currentScript.substring(0, 25000)}

      User Instruction: "${instruction}"

      Task:
      Rewrite or format the script based on the instruction.
      - If the instruction is "Auto Format", convert the text into standard screenplay format (Scene Headings CAPS, Character names centered/CAPS, Dialogue centered).
      - If the instruction is "Enhance Dialogue", improve the dialogue flow.
      - If the language is Malayalam, ensure the screenplay format is maintained (using English for technical terms like EXT./INT. is okay, but dialogue/action should be Malayalam).
      
      Return ONLY the refined script text. Do not add conversational filler.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error: any) {
    console.error("Script Refine Error:", error);
    return "";
  }
};

export const generateVisualPrompt = async (
  project: ProjectInfo,
  slideTitle: string,
  slideContent: string,
  extraStyle?: string
): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const prompt = `
      Act as a visual prompt engineer for high-end AI image generators (Midjourney/Imagen/Gemini).
      
      Project Concept:
      Type: ${project.projectType}
      Title: ${project.title}
      Genre: ${project.genre}
      
      Visual Context:
      Subject: ${slideTitle}
      Description: ${slideContent}
      
      Specific Style Instructions: ${extraStyle || "Cinematic, Photorealistic"}

      Task: Write a highly detailed, descriptive image prompt.
      
      Requirements:
      - ALWAYS write the prompt in ENGLISH.
      - Include camera angles, lighting, color palette, and mood.
      - Focus on the visual essence of the subject.
      - Output ONLY the prompt string.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error: any) {
    console.error("Prompt Gen Error:", error);
    return "Cinematic shot, 8k resolution, highly detailed, dramatic lighting --ar 16:9";
  }
};

// --- IMAGE GENERATION FUNCTIONS (Gemini 2.5 Flash Image) ---

export const generateSlideImage = async (imagePrompt: string, aspectRatio: '16:9'|'1:1'|'2:3' = '16:9'): Promise<string | null> => {
  try {
    const ai = getAIClient();
    // Using generateContent with gemini-2.5-flash-image which supports image generation via text prompting
    const model = "gemini-2.5-flash-image"; 

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: imagePrompt }] },
      config: {
        imageConfig: {
            aspectRatio: aspectRatio
        }
      }
    });
    return extractGeminiImageResponse(response);

  } catch (e: any) {
    console.error(`Image generation failed.`, e);
    throw e;
  }
};

export const generatePosterImage = async (
  poster: Poster,
  project: ProjectInfo
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash-image";
    
    let fullPrompt = `Create a High Quality Movie Poster. 
    Title: ${poster.title}. 
    Tagline: ${poster.tagline}. 
    Visual Description: ${poster.prompt}. 
    Style: ${poster.style}. 
    Requirements: Cinematic lighting, professional composition, high resolution text rendering for the Title.`;

    if (poster.characterRefId) {
      const char = project.characters?.find(c => c.id === poster.characterRefId);
      if (char) {
         fullPrompt += ` Featuring Character: ${char.name}, ${char.gender}, ${char.description}.`;
      }
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        imageConfig: {
            aspectRatio: poster.aspectRatio
        }
      }
    });
    return extractGeminiImageResponse(response);

  } catch (error: any) {
    console.error("Poster Gen Error:", error);
    throw error;
  }
};

export const generateCharacterImage = async (
  character: Character,
  prompt: string
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash-image";

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
            aspectRatio: character.aspectRatio
        }
      }
    });
    return extractGeminiImageResponse(response);
  } catch (e: any) {
    console.error("Character Gen Error:", e);
    throw e;
  }
};

export const generateStoryboardImage = async (
  project: ProjectInfo,
  scene: ShowcaseScene
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash-image";

    // 1. Prepare Technical Specs
    const techSpecs = [
      scene.lensType ? `${scene.lensType} lens` : '',
      scene.cameraAngle ? `${scene.cameraAngle} shot` : '',
      scene.shotSize ? `${scene.shotSize}` : '',
      scene.imageStyle ? `Art Style: ${scene.imageStyle}` : '',
      scene.colorGrade ? `Color Grading/Mood: ${scene.colorGrade}` : ''
    ].filter(Boolean).join(", ");

    let prompt = `Cinematic Storyboard Frame. 
    Scene Action: ${scene.action}. 
    Visual Details: ${scene.visualPrompt || scene.action}. 
    Camera Specs: ${techSpecs}. 
    Lighting: High contrast, dynamic composition, cinematic lighting. 
    Format: Landscape 16:9. Photorealistic.`;

    // 2. Add Character Context (Text only for stability)
    if (scene.characterRef1Id) {
      const c = project.characters?.find(x => x.id === scene.characterRef1Id);
      if (c) prompt += ` Featuring character: ${c.name} (${c.gender}, ${c.description}).`;
    }
    if (scene.characterRef2Id) {
      const c = project.characters?.find(x => x.id === scene.characterRef2Id);
      if (c) prompt += ` Also featuring character: ${c.name} (${c.gender}, ${c.description}).`;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
            aspectRatio: "16:9"
        }
      }
    });
    return extractGeminiImageResponse(response);
  } catch (e: any) {
    console.error("Storyboard Gen Error:", e);
    throw e;
  }
};

export const generateLocationImage = async (location: LocationAsset, sceneVibe: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash-image";

    const prompt = `
      Concept Art for Film Location.
      Location: ${location.name} (${location.description}).
      Scene Context: ${sceneVibe}.
      Style: Photorealistic, Cinematic, Wide Angle.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
            aspectRatio: "16:9"
        }
      }
    });
    return extractGeminiImageResponse(response);
  } catch (e: any) {
    console.error("Location Gen Error:", e);
    return null;
  }
};

// --- DATA GENERATION FUNCTIONS ---

export const generateNextShowcaseScene = async (
  project: ProjectInfo,
  existingScenes: ShowcaseScene[]
): Promise<ShowcaseScene | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const prevScenesSummary = existingScenes.map(s => `${s.heading}: ${s.action}`).join("\n");

    const prompt = `
      You are a storyboard artist and script breakdown specialist.
      
      Project: ${project.title} (${project.projectType})
      
      Full Story: ${project.fullScript ? project.fullScript.substring(0, 15000) : project.logline}

      Already Generated Scenes:
      ${prevScenesSummary}

      Task: Identify the NEXT key logical scene or beat.
      
      Output Format (Strictly Text with delimiters):
      HEADING: [Scene Heading]
      ACTION: [Brief description]
      PROMPT: [A highly detailed English visual prompt]
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "text/plain"
      }
    });

    const text = response.text?.trim() || "";
    
    // Simple parsing logic
    const headingMatch = text.match(/HEADING:\s*(.+)/);
    const actionMatch = text.match(/ACTION:\s*(.+)/);
    const promptMatch = text.match(/PROMPT:\s*(.+)/);

    if (headingMatch && actionMatch && promptMatch) {
      return {
        id: `scene-${Date.now()}`,
        heading: headingMatch[1].trim(),
        action: actionMatch[1].trim(),
        visualPrompt: promptMatch[1].trim(),
        // Defaults
        shotSize: 'Wide / Master',
        cameraAngle: 'Eye Level',
        lensType: '35mm',
        imageStyle: 'Hyper Realistic',
        colorGrade: 'Cinematic'
      };
    }

    return null;

  } catch (error: any) {
    console.error("Scene Gen Error:", error);
    return null;
  }
};

// --- AUDIO GENERATION (TTS) ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const chunkSize = 36 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, chunkSize, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true); 
  view.setUint32(24, sampleRate, true); 
  view.setUint32(28, byteRate, true); 
  view.setUint16(32, blockAlign, true); 
  view.setUint16(34, bitsPerSample, true); 

  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); 

  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const generateVoiceOver = async (text: string, voiceName: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash-preview-tts";

    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const pcmData = decode(base64Audio);
      const wavBuffer = pcmToWav(pcmData, 24000); 
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    }
    return null;

  } catch (error: any) {
    console.error("Audio Gen Error:", error);
    throw error;
  }
};

// Veo Video Generation
export const generateVideoTrailer = async (prompt: string): Promise<string | null> => {
  try {
    // Veo MANDATES paid key selection via UI.
    if (typeof window !== 'undefined' && (window as any).aistudio) {
        const aiStudio = (window as any).aistudio;
        try {
          const hasKey = await aiStudio.hasSelectedApiKey();
          if (!hasKey) {
            await aiStudio.openSelectKey();
          }
        } catch (e) {
          console.warn("AI Studio key selection failed", e);
        }
    }
    
    // Create new client to pick up selected key from process.env.API_KEY
    const ai = getAIClient();
    const model = "veo-3.1-fast-generate-preview";

    let operation;
    try {
        operation = await ai.models.generateVideos({
            model,
            prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });
    } catch (e: any) {
        // Handle "Requested entity was not found" error as per guidelines
        if (e.message?.includes("Requested entity was not found")) {
            if (typeof window !== 'undefined' && (window as any).aistudio) {
                 await (window as any).aistudio.openSelectKey();
                 throw new Error("API Key was not found. Please select a valid key and try again.");
            }
        }
        throw e;
    }

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;

    // Use process.env.API_KEY for fetching
    const apiKey = process.env.API_KEY || localStorage.getItem('gemini_api_key');
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);

  } catch (error: any) {
    console.error("Video Gen Error:", error);
    throw error;
  }
};

// --- LOCATION SCOUT ---

export const findLocations = async (project: ProjectInfo, requirements: string, region: string): Promise<LocationAsset[]> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const prompt = `
      Act as a professional Film Location Scout.
      
      Project Requirements:
      Scene Vibe: ${requirements}
      Target Region: ${region}
      
      Task: Find 3-4 REAL world locations that match this description perfectly.
      
      Return JSON Format (Array of objects):
      [
        {
          "id": "loc-1",
          "name": "Name of Place",
          "description": "Visual description",
          "suitability": "Why this fits the scene",
          "coordinates": "Approx City/State"
        }
      ]
      STRICT JSON OUTPUT ONLY. No markdown.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text?.trim() || "[]";
    return JSON.parse(text);

  } catch (error: any) {
    console.error("Location Search Error:", error);
    return [];
  }
};

export const generatePosterPrompt = async (project: ProjectInfo): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";
    
    // Pick a random poster archetype for variety
    const archetypes = [
      "Minimalist / Negative Space", 
      "Ensemble Cast (Floating Heads)", 
      "Character Portrait (Center)", 
      "Abstract / Symbolic", 
      "High Octane Action Montage", 
      "Typography Driven",
      "Silhouette / Noir",
      "Double Exposure"
    ];
    const randomArchetype = archetypes[Math.floor(Math.random() * archetypes.length)];

    const prompt = `
      Act as a professional Movie Poster Art Director.
      
      Project Details:
      Title: ${project.title}
      Genre: ${project.genre}
      Logline: ${project.logline}
      
      Full Script/Context:
      ${project.fullScript ? project.fullScript.substring(0, 15000) : "Use logline and title."}

      Task: 
      Design a unique movie poster concept using the archetype: "${randomArchetype}".
      Identify the most ICONIC, VISUALLY STRIKING, or MARKETABLE scene/concept that fits this archetype.

      Output:
      Write a highly detailed AI image prompt (for Midjourney/DALL-E) describing this poster.
      Include:
      - Main Subject (Hero/Villain/Object)
      - Composition: ${randomArchetype}
      - Lighting & Mood
      - Color Palette
      - Artistic Style (e.g. Painted, Photoreal, Graphic)
      
      Return ONLY the prompt string.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text?.trim() || "";

  } catch (error: any) {
    console.error("Poster Prompt Gen Error:", error);
    return "Cinematic movie poster, high contrast, dramatic lighting, 8k resolution";
  }
};

export const generateScriptRoadmap = async (storyConcept: string, language: 'en' | 'ml'): Promise<ScriptBeat[]> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const langInstruction = language === 'ml' 
      ? "Respond strictly in Malayalam (മലയാളം) language. Do not translate English technical terms like 'Interval' or 'Climax' but write the description in Malayalam." 
      : "Respond in English.";

    // Get the standard Indian beats from constants
    const beatList = INDIAN_CINEMA_BEATS.map((b, i) => `${i+1}. ${b.title}: ${b.description}`).join("\n");

    const prompt = `
      You are a Master Screenwriter for Indian Cinema (Mollywood/Bollywood).
      
      Story Concept:
      "${storyConcept}"

      Task:
      Break this story down into a 12-Point Cinematic Beat Sheet following this structure:
      ${beatList}

      For EACH beat, write a concise 1-2 sentence summary of exactly what happens in this specific story.
      
      Language Requirement: ${langInstruction}

      Output strictly as a JSON Array of objects:
      [
        {
          "title": "Beat Title",
          "description": "Specific story event description..."
        },
        ...
      ]
      STRICT JSON ONLY. No Markdown.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text?.trim() || "[]";
    const beatsData = JSON.parse(text);

    return beatsData.map((b: any, index: number) => ({
      id: `beat-${index}`,
      title: b.title,
      description: INDIAN_CINEMA_BEATS[index].description, 
      aiSuggestion: b.description, 
      isExpanded: false
    }));

  } catch (error: any) {
    console.error("Roadmap Gen Error:", error);
    return [];
  }
};

export const generateTwistIdeas = async (
  storyConcept: string,
  beatTitle: string,
  beatContext: string,
  language: 'en' | 'ml'
): Promise<TwistOption[]> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const langInstruction = language === 'ml' 
      ? "Write the content strictly in Malayalam (മലയാളം)." 
      : "Write the content in English.";

    const prompt = `
      You are a Creative Consultant for a movie script.
      
      Original Story Concept: "${storyConcept}"
      
      Current Beat: ${beatTitle}
      Context/Setup so far: ${beatContext}

      Task: Generate 3 DISTINCT Plot Options for this specific beat.
      
      1. Path A: The Classic Turn (Expected/Dramatic/Safe)
      2. Path B: The Emotional Twist (Heartbreaking/Deep)
      3. Path C: The Wildcard Shock (Thriller/Psycho/Unexpected)

      Language: ${langInstruction}

      Return JSON Format:
      {
        "options": [
          { "type": "Classic", "title": "The Safe Bet", "content": "..." },
          { "type": "Emotional", "title": "The Heartbreaker", "content": "..." },
          { "type": "Wildcard", "title": "The Shock", "content": "..." }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text?.trim() || "{}";
    const data = JSON.parse(text);
    return data.options || [];

  } catch (error: any) {
    console.error("Twist Gen Error:", error);
    return [];
  }
};

export const generateBudgetEstimate = async (
  project: ProjectInfo,
  scale: 'Micro/Indie' | 'Mid-Range' | 'Blockbuster',
  currency: 'INR' | 'USD'
): Promise<BudgetLineItem[]> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const prompt = `
      Act as an experienced Line Producer for Film & TV.
      
      Project: ${project.title}
      Type: ${project.projectType}
      Genre: ${project.genre}
      Scale: ${scale}
      Currency: ${currency}
      
      Script/Story Context:
      ${project.fullScript ? project.fullScript.substring(0, 15000) : project.logline}
      
      Characters Count: ${project.characters?.length || "Unknown"}
      Scenes Count: ${project.showcaseScenes?.length || "Unknown"}

      Task:
      Create a detailed Preliminary Budget Estimate based on the script requirements (locations, VFX, cast size, etc.).
      
      Rules:
      1. Break down costs into 5 Categories: 'Above The Line', 'Below The Line', 'Post-Production', 'Marketing/Distribution', 'Contingency'.
      2. Provide realistic numbers for the requested Scale and Currency.
      3. For INR, use actual values (e.g. 5000000 for 50 Lakhs). For USD, use standard dollar amounts.
      
      Output strictly as JSON Array:
      [
        {
          "category": "Category Name",
          "item": "Specific Line Item (e.g. Director Fee, Camera Rental, VFX)",
          "cost": 100000,
          "notes": "Brief explanation of cost basis"
        }
      ]
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text?.trim() || "[]";
    const rawItems = JSON.parse(text);

    return rawItems.map((item: any, idx: number) => ({
      id: `budget-${Date.now()}-${idx}`,
      category: item.category,
      item: item.item,
      cost: item.cost,
      notes: item.notes
    }));

  } catch (error: any) {
    console.error("Budget Gen Error:", error);
    return [];
  }
};

export const getCinemaChatResponse = async (history: {role: string, content: string}[], newMessage: string) => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = ai.chats.create({
      model,
      history: chatHistory,
      config: {
        systemInstruction: "You are the 'AI Cinema Master', an expert filmmaking assistant for the application AICINEMASUITE.com.",
      },
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text;
  } catch (error: any) {
    console.error("Chat Bot Error:", error);
    return "I'm having trouble connecting to the studio server. Please check your API Key in Settings.";
  }
};