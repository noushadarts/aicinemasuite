import React, { useState, useEffect, useRef } from 'react';
import { ProjectInfo, Slide, ViewMode, ShowcaseScene, ProjectType, Character, Poster, ServiceType, StudioTab, AudioAsset, VideoAsset, UserProfile, ToastMessage, ToastType, FileSystemFileHandle } from './types';
import { generateSlideContent, generateVisualPrompt, generateSlideImage, generateNextShowcaseScene } from './services/geminiService';
import { ProjectIO } from './services/ProjectIO';
import { SetupView } from './components/SetupView';
import { StudioView } from './components/StudioView';
import { PresentationView } from './components/PresentationView';
import { StoryboardPresentation } from './components/StoryboardPresentation';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { FAQOverlay } from './components/FAQOverlay';
import { AuthScreen } from './components/AuthScreen';
import { FeedbackModal } from './components/FeedbackModal'; 
import { AIChatBot } from './components/AIChatBot'; 
import { ToastContainer } from './components/ToastContainer';
import { APIKeyModal } from './components/APIKeyModal';
import { ICONS, DICTIONARY, SLIDE_TEMPLATES_BY_TYPE } from './constants';
import { Button } from './components/Button';

// Initial state factory to ensure deep copies on reset
const getInitialProjectState = (): ProjectInfo => ({
  title: "",
  genre: "",
  logline: "",
  director: "",
  language: 'en',
  fullScript: "",
  projectType: ProjectType.FEATURE_FILM,
  serviceType: ServiceType.PITCH_DECK,
  showcaseScenes: [],
  characters: [],
  posters: [],
  audioAssets: [],
  videos: [],
  castList: [],
  crewList: [
    { id: 'c1', role: 'Director', name: '' },
    { id: 'c2', role: 'Screenwriter', name: '' },
    { id: 'c3', role: 'Producer', name: '' },
    { id: 'c4', role: 'Cinematographer (DOP)', name: '' },
    { id: 'c5', role: 'Editor', name: '' }
  ],
  vaultItems: []
});

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // State
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SETUP);
  const [presentationType, setPresentationType] = useState<'DECK' | 'STORYBOARD'>('DECK');
  const [setupStep, setSetupStep] = useState<'SERVICES' | 'CATEGORY' | 'DETAILS'>('SERVICES');

  const [project, setProject] = useState<ProjectInfo>(getInitialProjectState());
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [initialStudioTab, setInitialStudioTab] = useState<StudioTab>('DECK');
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>('DECK');
  
  const [hasSavedProject, setHasSavedProject] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false); // Feedback State
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // --- AUTO SAVE / FILE HANDLE STATE ---
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // TOAST SYSTEM
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (title: string, type: ToastType = 'info', message?: string) => {
    const id = Date.now().toString();
    setToasts((prev: ToastMessage[]) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev: ToastMessage[]) => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev: ToastMessage[]) => prev.filter(t => t.id !== id));
  };

  // REFS FOR LATEST STATE ACCESS (Critical for Save Function)
  const projectRef = useRef(project);
  const slidesRef = useRef(slides);
  const activeSlideIdRef = useRef(activeSlideId);
  const fileHandleRef = useRef(fileHandle);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => { activeSlideIdRef.current = activeSlideId; }, [activeSlideId]);
  useEffect(() => { fileHandleRef.current = fileHandle; }, [fileHandle]);

  // Prevent accidental close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (slides.length > 0 || project.title) {
        e.preventDefault();
        e.returnValue = ''; // Standard browser trigger
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [slides.length, project.title]);

  // Check Auth and API Key on Mount
  useEffect(() => {
    const session = localStorage.getItem('cinepitch_auth_session');
    const storedUser = localStorage.getItem('cinepitch_user_profile');
    
    if (session) {
      setIsAuthenticated(true);
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    }
    setAuthChecked(true);

    const saved = localStorage.getItem('cinepitch_project_meta');
    if (saved) setHasSavedProject(true);

    // Check for API Key if not in env
    const hasEnvKey = !!process.env.API_KEY;
    const hasLocalKey = !!localStorage.getItem('gemini_api_key');
    if (!hasEnvKey && !hasLocalKey) {
        setShowApiKeyModal(true);
    }
  }, []);

  // --- AUTO SAVE EFFECT (Run every 5 minutes if handle exists) ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (fileHandleRef.current) {
        console.log("Auto-Save Triggered...");
        addToast("Auto-Saving...", "info");
        handleSaveProjectFile();
      }
    }, 300000); // 5 minutes = 300,000 ms

    return () => clearInterval(interval);
  }, []); // Only set up interval once, refs handle state access

  const handleSaveApiKey = (key: string) => {
     if (key) {
        localStorage.setItem('gemini_api_key', key);
        setShowApiKeyModal(false);
        addToast("Studio Activated", "success", "AI services are now online.");
     } else {
        localStorage.removeItem('gemini_api_key');
        setShowApiKeyModal(true);
     }
  };

  const handleLogin = (email: string) => {
    localStorage.setItem('cinepitch_auth_session', 'true');
    
    // ADMIN LOGIC: Check for the new domain Owner
    const isAdmin = email.toLowerCase() === 'noushadart@gmail.com';

    const namePart = email.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    const newProfile: UserProfile = {
      name: formattedName,
      email: email,
      role: isAdmin ? 'ADMIN' : 'USER',
      credits: isAdmin ? 999999 : 1000, 
      phone: ''
    };
    
    setCurrentUser(newProfile);
    localStorage.setItem('cinepitch_user_profile', JSON.stringify(newProfile));
    
    setIsAuthenticated(true);
    addToast(`Welcome back, ${formattedName}!`, 'success');
  };

  const handleUpdateUser = (updates: Partial<UserProfile>) => {
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updates };
    
    if (updates.email) {
       const isAdmin = updates.email.toLowerCase() === 'noushadart@gmail.com';
       updatedUser.role = isAdmin ? 'ADMIN' : 'USER'; 
    }

    setCurrentUser(updatedUser);
    localStorage.setItem('cinepitch_user_profile', JSON.stringify(updatedUser));
    addToast("Profile updated successfully", 'success');
  };

  const handleLogout = () => {
    localStorage.removeItem('cinepitch_auth_session');
    localStorage.removeItem('cinepitch_user_profile');
    
    setProject(getInitialProjectState());
    setSlides([]);
    setActiveSlideId(null);
    setHasSavedProject(false);
    setFileHandle(null); // Clear handle
    
    setSetupStep('SERVICES');
    setInitialStudioTab('DECK');
    setActiveStudioTab('DECK');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setViewMode(ViewMode.SETUP);
  };

  // --- SMART SAVE HANDLER ---
  const handleSaveProjectFile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    const isAutoSave = !!fileHandleRef.current;
    if (!isAutoSave) {
       document.title = "Saving... Do not close";
       addToast("Packing project assets...", 'info', "Please choose a location to save your .cinepitch file.");
    }
    
    try {
      const handle = await ProjectIO.save(
        projectRef.current, 
        slidesRef.current, 
        activeSlideIdRef.current,
        fileHandleRef.current
      );
      
      // Update handle if a new one was returned
      if (handle) {
         setFileHandle(handle);
      }
      
      localStorage.setItem('cinepitch_project_meta', JSON.stringify({ 
         title: projectRef.current.title, 
         lastSaved: new Date().toISOString() 
      }));
      setHasSavedProject(true);
      
      addToast(
         isAutoSave ? "Auto-Saved Successfully" : "Project Saved", 
         'success', 
         isAutoSave ? undefined : "Your work is secure. We will auto-save to this file."
      );

    } catch (e: any) {
      console.error("SAVE FAILED:", e);
      addToast("Save Failed", 'error', e.message);
    } finally {
      document.title = "AICINEMASUITE | AI Film Studio";
      setIsSaving(false);
    }
  };

  const handleLoadProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const originalTitle = document.title;
    document.title = "Loading Project...";
    addToast("Unpacking project file...", 'info');

    try {
       const data = await ProjectIO.load(file);
       if (data) {
          setProject(data.project);
          setSlides(data.slides);
          setActiveSlideId(data.activeSlideId || data.slides[0]?.id);
          
          // NOTE: We cannot get a FileSystemHandle from a simple input type="file"
          // The user must "Save As" again to establish an auto-save link for safety in browsers.
          setFileHandle(null); 
          
          const tab: StudioTab = 'DECK';
          setInitialStudioTab(tab);
          setActiveStudioTab(tab);
          setViewMode(ViewMode.STUDIO);
          setHasSavedProject(true);
          addToast("Project Loaded", 'success', "Click Save to enable Auto-Save.");
       }
    } catch (e: any) {
       console.error("LOAD FAILED:", e);
       addToast("Load Failed", 'error', e.message);
    } finally {
       document.title = originalTitle;
       e.target.value = ''; 
    }
  };

  const handleResume = () => {
     alert("Please use 'Open Project File' to load your full .cinepitch file. Browser auto-resume is disabled for large projects to prevent crashing.");
  };

  // --- EXPORT LOGIC (PDF/ZIP) ---
  const handleDownloadPDF = () => {
    setIsExporting(true);
    addToast("Generating PDF...", 'info', "Please wait while we render your slides.");
    const element = document.getElementById('export-container');
    const opt = {
      margin: [10, 10],
      filename: `${project.title}_PitchDeck.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(element).save().then(() => {
        setIsExporting(false);
        setShowExportModal(false);
        addToast("PDF Exported", 'success');
      });
    } else {
      alert("PDF Engine not loaded. Please refresh.");
      setIsExporting(false);
    }
  };

  const handleDownloadZIP = async () => {
    setIsExporting(true);
    addToast("Zipping Assets...", 'info');
    const zip = new window.JSZip();
    const imgFolder = zip.folder("images");
    const vaultFolder = zip.folder("vault");
    let count = 0;

    const addToZip = (url: string | null | undefined, name: string) => {
       if (url && url.startsWith('data:')) {
          const base64Data = url.split(',')[1];
          imgFolder.file(name, base64Data, { base64: true });
          count++;
       }
    };

    slides.forEach((s: Slide, i: number) => addToZip(s.imageUrl, `Slide_${i+1}.png`));
    project.showcaseScenes?.forEach((s: ShowcaseScene, i: number) => addToZip(s.imageUrl, `Scene_${i+1}.png`));
    project.characters?.forEach((c: Character) => addToZip(c.imageUrl, `Char_${c.name}.png`));
    project.posters?.forEach((p: Poster, i: number) => addToZip(p.imageUrl, `Poster_${i+1}.png`));
    project.castList?.forEach((c, i) => {
       addToZip(c.characterImage, `Cast_Char_${i+1}.png`);
       addToZip(c.actorImage, `Cast_Actor_${i+1}.png`);
    });
    
    if (project.vaultItems) {
       project.vaultItems.forEach((v, i) => {
          if (v.url && v.url.startsWith('data:')) {
             const base64Data = v.url.split(',')[1];
             vaultFolder.file(v.fileName || `Vault_${i}`, base64Data, { base64: true });
             count++;
          }
       });
    }

    if (count === 0) {
      addToast("No images found", 'warning', "Generate some content first!");
      setIsExporting(false);
      return;
    }

    zip.generateAsync({ type: "blob" }).then((content: any) => {
      window.saveAs(content, `${project.title}_Assets.zip`);
      setIsExporting(false);
      setShowExportModal(false);
      addToast("Assets Downloaded", 'success');
    });
  };
  
  const handleGoHome = () => {
    setSetupStep('SERVICES');
    setViewMode(ViewMode.SETUP);
  };
  
  const handleFullReset = () => {
    setProject(getInitialProjectState());
    setSlides([]);
    setActiveSlideId(null);
    setFileHandle(null);
  };

  // Loading States
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);

  // Drag State
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);

  const handleCreateProject = (targetTab: StudioTab) => {
    if (!project.title) return;
    const templates = SLIDE_TEMPLATES_BY_TYPE[project.projectType] || SLIDE_TEMPLATES_BY_TYPE[ProjectType.FEATURE_FILM];
    
    if (slides.length === 0) {
        const initialSlides: Slide[] = templates.map((tpl, index) => ({
        id: `slide-${Date.now()}-${index}`,
        title: tpl.title,
        description: tpl.description,
        placeholder: tpl.placeholderText,
        content: "",
        imagePrompt: "",
        imageUrl: null
        }));
        setSlides(initialSlides);
        setActiveSlideId(initialSlides[0].id);
    }
    
    setInitialStudioTab(targetTab);
    setActiveStudioTab(targetTab);
    setViewMode(ViewMode.STUDIO);
  };

  const handleAddSlide = () => {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      title: "New Custom Slide",
      content: "",
      imagePrompt: "",
      imageUrl: null,
      isCustom: true,
      description: "Use this slide for additional details, research, or custom content.",
      placeholder: "Type your content here..."
    };
    setSlides([...slides, newSlide]);
  };

  const handleUpdateSlide = (id: string, updates: Partial<Slide>) => {
    setSlides(slides.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const getActiveSlide = () => slides.find(s => s.id === activeSlideId);

  const handleAddCharacter = (char: Character) => {
    setProject(prev => ({ ...prev, characters: [...(prev.characters || []), char] }));
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    setProject(prev => ({
      ...prev,
      characters: prev.characters?.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  };

  const handleAddPoster = (poster: Poster) => {
    setProject(prev => ({ ...prev, posters: [...(prev.posters || []), poster] }));
  };

  const handleUpdatePoster = (id: string, updates: Partial<Poster>) => {
    setProject(prev => ({
      ...prev,
      posters: prev.posters?.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  };

  const handleUpdateScene = (id: string, updates: Partial<ShowcaseScene>) => {
    setProject(prev => ({
      ...prev,
      showcaseScenes: prev.showcaseScenes?.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const handleAddAudio = (audio: AudioAsset) => {
    setProject(prev => ({ ...prev, audioAssets: [...(prev.audioAssets || []), audio] }));
  };

  const handleAddVideo = (video: VideoAsset) => {
    setProject(prev => ({ ...prev, videos: [...(prev.videos || []), video] }));
  };

  const handleDeleteVideo = (id: string) => {
    setProject(prev => ({ ...prev, videos: prev.videos?.filter(v => v.id !== id) }));
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedSlideIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); 
  };

  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedSlideIndex === null || draggedSlideIndex === dropIndex) return;
    const newSlides = [...slides];
    const [draggedItem] = newSlides.splice(draggedSlideIndex, 1);
    newSlides.splice(dropIndex, 0, draggedItem);
    setSlides(newSlides);
    setDraggedSlideIndex(null);
  };

  // --- Gemini Wrappers ---
  const handleAutoPrompt = async (extraStyle?: string) => {
    const slide = getActiveSlide();
    if (!slide) return;
    setIsGeneratingPrompt(true);
    try {
      const prompt = await generateVisualPrompt(project, slide.title, slide.content, extraStyle);
      handleUpdateSlide(slide.id, { imagePrompt: prompt });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateContent = async () => {
    const slide = getActiveSlide();
    if (!slide) return;
    setIsGeneratingContent(true);
    try {
      const content = await generateSlideContent(project, slide.title, slide.content);
      handleUpdateSlide(slide.id, { content });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleGenerateImage = async () => {
    const slide = getActiveSlide();
    if (!slide || !slide.imagePrompt) return;
    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateSlideImage(slide.imagePrompt, '16:9');
      if (imageUrl) {
        handleUpdateSlide(slide.id, { imageUrl });
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateNextScene = async () => {
    setIsGeneratingScene(true);
    try {
      const nextScene = await generateNextShowcaseScene(project, project.showcaseScenes || []);
      if (nextScene) {
        setProject(prev => ({
          ...prev,
          showcaseScenes: [...(prev.showcaseScenes || []), nextScene]
        }));
      } else {
        addToast("Scene Gen Failed", "error");
      }
    } finally {
      setIsGeneratingScene(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slide = getActiveSlide();
    if (!slide || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      handleUpdateSlide(slide.id, { imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const t = DICTIONARY[project.language];

  // --- Sub Components ---
  const ExportModal = () => (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-xl font-bold text-white mb-2 cinematic-font">Export Project</h3>
        <p className="text-zinc-400 text-sm mb-6">Choose your export format.</p>
        <div className="space-y-3">
          <button onClick={handleDownloadPDF} disabled={isExporting} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center gap-4 transition-all group">
            <div className="bg-red-900/30 p-3 rounded-full text-red-500 group-hover:text-white group-hover:bg-red-600 transition-colors"><ICONS.FileText size={24}/></div>
            <div className="text-left"><h4 className="font-bold text-white">Download as PDF</h4></div>
          </button>
          <button onClick={handleDownloadZIP} disabled={isExporting} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center gap-4 transition-all group">
            <div className="bg-blue-900/30 p-3 rounded-full text-blue-500 group-hover:text-white group-hover:bg-blue-600 transition-colors"><ICONS.Image size={24}/></div>
            <div className="text-left"><h4 className="font-bold text-white">Download Image Pack (ZIP)</h4></div>
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={() => setShowExportModal(false)} disabled={isExporting}>Cancel</Button>
        </div>
      </div>
    </div>
  );

  const CommonHeader = () => {
    // Read the YouTube link directly from localStorage or fallback
    const tutorialLink = localStorage.getItem('cinepitch_youtube_link') || "https://www.youtube.com/";

    return (
    <div className="absolute top-0 right-0 p-4 z-50 flex gap-3 items-center">
       {/* Beta & Feedback Area */}
       <div className="flex items-center gap-2 mr-4 bg-zinc-900/80 p-1 pr-3 rounded-full border border-zinc-800">
          <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Beta v1.0</span>
          <button 
            onClick={() => setShowFeedback(true)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <ICONS.MessageSquare size={12} /> Feedback
          </button>
       </div>
      
       {/* Tutorials Link - Dynamic */}
       <a 
         href={tutorialLink} 
         target="_blank" 
         rel="noopener noreferrer"
         className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors border border-transparent hover:border-zinc-700 mr-2"
       >
         <ICONS.Youtube size={14} className="text-red-600" />
         <span>Tutorials</span>
       </a>

       <div className="flex bg-zinc-900 border border-zinc-800 rounded-full p-1 mr-2">
         <button onClick={() => setProject({...project, language: 'en'})} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${project.language === 'en' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-white'}`}>EN</button>
         <button onClick={() => setProject({...project, language: 'ml'})} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${project.language === 'ml' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-white'}`}>ML</button>
       </div>
       <button onClick={() => setShowFAQ(true)} className="text-zinc-500 hover:text-white transition-colors"><ICONS.HelpCircle size={24} /></button>
       <div className="relative">
         <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white font-bold shadow-lg hover:ring-2 hover:ring-amber-500 transition-all text-xs overflow-hidden">
            {currentUser?.name?.charAt(0) || "U"}
         </button>
         {showUserMenu && (
           <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
             <div className="px-4 py-2 border-b border-zinc-800 mb-1">
               <p className="text-white font-bold text-sm truncate">{currentUser?.name || "Guest"}</p>
               <p className="text-zinc-500 text-[10px] truncate">{currentUser?.email || ""}</p>
               {currentUser?.role === 'ADMIN' && <span className="text-[9px] bg-red-600 text-white px-1 rounded ml-1">OWNER</span>}
             </div>
             <button onClick={() => { setViewMode(ViewMode.PROFILE); setShowUserMenu(false); }} className="w-full text-left px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm flex items-center gap-2"><ICONS.User size={14}/> {t.myProfile}</button>
             <button onClick={() => { setViewMode(ViewMode.ADMIN); setShowUserMenu(false); }} className="w-full text-left px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm flex items-center gap-2">
                <ICONS.Settings size={14}/> 
                {currentUser?.role === 'ADMIN' ? "System Admin" : "Project Settings"}
             </button>
             <button onClick={() => setShowApiKeyModal(true)} className="w-full text-left px-4 py-2 text-amber-500 hover:text-amber-400 hover:bg-zinc-800 text-sm flex items-center gap-2"><ICONS.Key size={14}/> Manage API Key</button>
             <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-zinc-800 text-sm flex items-center gap-2"><ICONS.LogOut size={14}/> {t.logout}</button>
           </div>
         )}
       </div>
    </div>
  )};

  if (!authChecked) return null;

  if (!isAuthenticated) {
     return (
       <>
         <AuthScreen onLogin={handleLogin} />
         {showFAQ && <FAQOverlay onClose={() => setShowFAQ(false)} />}
         
         {/* Footer Contact Trigger for Auth Screen */}
         <div className="fixed bottom-4 right-4 z-50">
            <button 
              onClick={() => setShowFAQ(true)} 
              className="text-xs text-zinc-500 hover:text-amber-500 transition-colors"
            >
               Contact & Support
            </button>
         </div>
       </>
     );
  }

  return (
    <div className="relative font-sans text-zinc-200 selection:bg-amber-500/30">
      
      {/* GLOBAL NOTIFICATIONS */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* GLOBAL CHAT BOT COMPONENT */}
      <AIChatBot />

      {/* API KEY MODAL */}
      {showApiKeyModal && (
         <APIKeyModal 
            onSave={handleSaveApiKey} 
            onClose={() => setShowApiKeyModal(false)}
            isMandatory={!process.env.API_KEY && !localStorage.getItem('gemini_api_key')}
         />
      )}

      {/* Invisible element for PDF Export */}
      <div id="export-container" className="fixed left-[9999px] top-0 w-[1280px]">
          {/* Cover Page */}
          <div className="w-full h-[720px] relative bg-black flex flex-col items-center justify-center text-center p-20 break-after-page">
             <h1 className="text-8xl font-bold text-white mb-6 uppercase tracking-tighter cinematic-font">{project.title}</h1>
             <p className="text-3xl text-amber-500 uppercase tracking-widest mb-12">{project.genre} | {project.director}</p>
             <div className="max-w-4xl text-2xl text-zinc-300 leading-relaxed">{project.logline}</div>
          </div>
          {/* Slides */}
          {slides.map((s, i) => (
             <div key={s.id} className="w-full h-full relative bg-black flex break-after-page overflow-hidden">
                <div className="w-1/2 h-full relative">
                   {s.imageUrl ? (
                      <img src={s.imageUrl} className="w-full h-full object-cover" />
                   ) : (
                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700">NO VISUAL</div>
                   )}
                </div>
                <div className="w-1/2 h-full p-16 bg-zinc-950 border-l border-zinc-800 flex flex-col justify-center">
                   <h2 className="text-5xl font-bold text-white mb-8 cinematic-font">{s.title}</h2>
                   <p className="text-xl text-zinc-300 leading-relaxed whitespace-pre-wrap">{s.content}</p>
                   <div className="mt-auto pt-8 border-t border-zinc-800 text-zinc-500 flex justify-between">
                      <span>{project.title}</span>
                      <span>Page {i + 1}</span>
                   </div>
                </div>
             </div>
          ))}
      </div>

      {viewMode === ViewMode.SETUP && <CommonHeader />}
      
      {showFAQ && <FAQOverlay onClose={() => setShowFAQ(false)} />}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showExportModal && <ExportModal />}

      {viewMode === ViewMode.SETUP && (
        <SetupView 
          project={project} 
          setProject={setProject} 
          onStart={handleCreateProject} 
          onResume={hasSavedProject ? handleResume : undefined}
          onLoadFromFile={handleLoadProjectFile}
          hasSavedProject={hasSavedProject}
          step={setupStep}
          setStep={setSetupStep}
          onReset={handleFullReset}
        />
      )}

      {viewMode === ViewMode.STUDIO && (
        <div className="animate-in fade-in duration-500">
          <StudioView 
            project={project}
            slides={slides}
            activeSlideId={activeSlideId}
            setActiveSlideId={setActiveSlideId}
            onUpdateSlide={handleUpdateSlide}
            onAddSlide={handleAddSlide}
            onPresentationMode={(type) => {
               setPresentationType(type || 'DECK');
               setViewMode(ViewMode.PRESENTATION);
            }}
            onStructureMode={() => setViewMode(ViewMode.SETUP)}
            onGoHome={handleGoHome}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onGenerateContent={handleGenerateContent}
            isGeneratingContent={isGeneratingContent}
            onAutoPrompt={handleAutoPrompt}
            isGeneratingPrompt={isGeneratingPrompt}
            onGenerateImage={handleGenerateImage}
            isGeneratingImage={isGeneratingImage}
            onFileUpload={handleFileUpload}
            showcaseScenes={project.showcaseScenes || []}
            onGenerateNextScene={handleGenerateNextScene}
            isGeneratingScene={isGeneratingScene}
            onUpdateScene={handleUpdateScene}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onAddPoster={handleAddPoster}
            onUpdatePoster={handleUpdatePoster}
            onAddAudio={handleAddAudio}
            onAddVideo={handleAddVideo}
            onDeleteVideo={handleDeleteVideo}
            initialTab={initialStudioTab}
            onTabChange={(t) => setActiveStudioTab(t)}
            onSave={handleSaveProjectFile}
            onExport={() => setShowExportModal(true)}
            // Nav Props
            onOpenProfile={() => setViewMode(ViewMode.PROFILE)}
            onOpenAdmin={() => setViewMode(ViewMode.ADMIN)}
            onLogout={handleLogout}
            onOpenFAQ={() => setShowFAQ(true)}
            currentUser={currentUser}
            onUpdateProject={(updates) => setProject(prev => ({ ...prev, ...updates }))}
          />
        </div>
      )}

      {viewMode === ViewMode.PRESENTATION && (
        presentationType === 'STORYBOARD' ? (
          <StoryboardPresentation
            project={project}
            scenes={project.showcaseScenes || []}
            onClose={() => setViewMode(ViewMode.STUDIO)}
          />
        ) : (
          <PresentationView 
            project={project}
            slides={slides}
            activeSlideId={activeSlideId}
            setActiveSlideId={setActiveSlideId}
            onClose={() => setViewMode(ViewMode.STUDIO)}
          />
        )
      )}

      {viewMode === ViewMode.PROFILE && (
        <ProfileView 
          onBack={() => setViewMode(ViewMode.STUDIO)} 
          user={currentUser} 
          onUpdateUser={handleUpdateUser}
        />
      )}

      {viewMode === ViewMode.ADMIN && (
        <AdminView 
           project={project}
           setProject={setProject}
           slides={slides}
           setSlides={setSlides}
           onBack={() => setViewMode(ViewMode.STUDIO)}
           user={currentUser}
        />
      )}

    </div>
  );
};

export default App;