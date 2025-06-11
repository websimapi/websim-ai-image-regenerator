import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WebsimSocket, useQuery } from '@websim/use-query';

const room = new WebsimSocket();

const STYLES = {
    photorealistic: { name: '📸 Photorealistic', prompt: 'photorealistic, high quality, professional photography, detailed' },
    cartoon: { name: '🎨 Cartoon', prompt: 'cartoon style, animated, colorful, fun, Disney-like animation' },
    anime: { name: '🌸 Anime', prompt: 'anime style, manga art, Japanese animation, detailed anime illustration' },
    oil_painting: { name: '🖼️ Oil Painting', prompt: 'oil painting style, classical art, painterly, artistic brushstrokes' },
    watercolor: { name: '🎭 Watercolor', prompt: 'watercolor painting, soft colors, artistic, painted texture' },
    sketch: { name: '✏️ Sketch', prompt: 'pencil sketch, hand-drawn, artistic sketch, black and white or minimal color' },
};

function App() {
    // UI State
    const [activeTab, setActiveTab] = useState('camera');
    const [status, setStatus] = useState({ message: '', type: 'info' });

    // Camera & Image State
    const [currentStream, setCurrentStream] = useState(null);
    const [capturedImageDataUrl, setCapturedImageDataUrl] = useState(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState(null);

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedStyle, setSelectedStyle] = useState('photorealistic');
    const [progress, setProgress] = useState(0);
    const progressIntervalRef = useRef(null);

    // User State
    const [currentUser, setCurrentUser] = useState(null);

    // Element Refs
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    
    // Database
    const { data: galleryItems, loading: galleryLoading } = useQuery(
        room.query(`
            SELECT
                gi.id,
                gi.url,
                gi.style,
                gi.user_id, -- Ensure user_id is selected
                u.username
            FROM public.gallery_images gi
            JOIN public.user u ON gi.user_id = u.id
            ORDER BY gi.created_at DESC
        `)
    );

    // Fetch current user
    useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                const user = await window.websim.getCurrentUser();
                setCurrentUser(user);
            } catch (error) {
                console.error("Error fetching current user:", error);
                showStatus('Could not fetch user information.', 'error');
            }
        };
        fetchCurrentUser();
    }, []);

    const showStatus = useCallback((message, type = 'info', duration = 3000) => {
        setStatus({ message, type });
        if (type === 'success' || type === 'error' || !message) {
            setTimeout(() => setStatus(s => s.message === message ? { message: '', type: 'info' } : s), duration);
        }
    }, []);

    const startCamera = async () => {
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setCurrentStream(stream);
            showStatus('Camera ready! 📸', 'success');
        } catch (error) {
            console.error('Error accessing camera:', error);
            showStatus('Camera access denied. Please use file upload instead.', 'error');
        }
    };

    const stopCamera = useCallback(() => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            setCurrentStream(null);
        }
    }, [currentStream]);

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImageDataUrl(dataUrl);
        stopCamera();
        showStatus('Photo captured! Choose a style and generate. ✨', 'success');
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setCapturedImageDataUrl(e.target.result);
                showStatus('Image loaded! Choose a style and generate. ✨', 'success');
            };
            reader.readAsDataURL(file);
        }
    };

    const retakePhoto = () => {
        setCapturedImageDataUrl(null);
        setGeneratedImageUrl(null);
        setStatus({ message: '', type: 'info' });
        stopCamera();
    };
    
    const showProgress = () => {
        setIsGenerating(true);
        setProgress(0);
        progressIntervalRef.current = setInterval(() => {
            setProgress(p => {
                const newProgress = p + Math.random() * 15;
                return newProgress > 90 ? 90 : newProgress;
            });
        }, 500);
    };

    const hideProgress = () => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        setProgress(100);
        setTimeout(() => {
            setIsGenerating(false);
            setProgress(0);
        }, 500);
    };
    
    const analyzeAndGenerate = async () => {
        if (!capturedImageDataUrl) return;

        showProgress();
        showStatus('Analyzing image with AI... 🧠', 'info', 60000);

        try {
            const analysisCompletion = await websim.chat.completions.create({
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: `Analyze this image in great detail. Describe everything you see including main subjects, objects, colors, lighting, atmosphere, setting, background, composition, perspective, and overall mood. Provide a comprehensive description.` },
                        { type: "image_url", image_url: { url: capturedImageDataUrl } }
                    ]
                }]
            });
            const imageDescription = analysisCompletion.content;
            
            showStatus('Creating AI version... ✨', 'info', 60000);

            const finalPrompt = `${imageDescription}, rendered in ${STYLES[selectedStyle].prompt} style`;
            
            const result = await websim.imageGen({
                prompt: finalPrompt,
                aspect_ratio: "1:1"
            });
            
            setGeneratedImageUrl(result.url);
            setCapturedImageDataUrl(result.url); // for regeneration

            hideProgress();
            showStatus('AI version generated successfully! 🎉', 'success');

        } catch (error) {
            console.error('Error generating image:', error);
            hideProgress();
            showStatus('Failed to generate image. Please try again.', 'error');
        }
    };
    
    const saveImageToDevice = () => {
        if (!generatedImageUrl) return;
        const link = document.createElement('a');
        link.download = `ai-generated-${Date.now()}.png`;
        link.href = generatedImageUrl;
        link.click();
        showStatus('Image saved! 💾', 'success');
    };

    const addToGallery = async () => {
        if (!generatedImageUrl) return;
        try {
            await room.collection('gallery_images').create({
                url: generatedImageUrl,
                style: selectedStyle,
            });
            showStatus('Added to gallery! 🖼️', 'success');
        } catch (error) {
            console.error('Error adding to gallery:', error);
            showStatus('Could not add to gallery. Please try again.', 'error');
        }
    };

    const handleDeleteFromGallery = async (imageId) => {
        if (!window.confirm("Are you sure you want to delete this image from the gallery?")) return;
        
        showStatus('Deleting image...', 'info', 60000);
        try {
            await room.collection('gallery_images').delete(imageId);
            showStatus('Image removed from gallery! 🗑️', 'success');
        } catch (error) {
            console.error('Error deleting image from gallery:', error);
            showStatus('Could not remove image. Please try again or check permissions.', 'error');
        }
    };
    
    // Effect for camera cleanup
    useEffect(() => {
        return () => stopCamera();
    }, [stopCamera]);
    
    const showCameraControls = !capturedImageDataUrl && !currentStream;
    const showCaptureControls = !!currentStream;
    const showImagePreview = !!capturedImageDataUrl;
    
    return (
        <div className="container">
            <div className="header">
                <h1>🎨 AI Image Regenerator</h1>
                <p>Capture reality, reimagine with AI</p>
            </div>

            <div className="nav-tabs">
                <div className={`nav-tab ${activeTab === 'camera' ? 'active' : ''}`} onClick={() => setActiveTab('camera')}>📷 Create</div>
                <div className={`nav-tab ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>🖼️ Gallery</div>
            </div>
            
            <div className="main-content">
                <div id="cameraTab" className={activeTab !== 'camera' ? 'hidden' : ''}>
                    <div className="section camera-section">
                        {showCameraControls && (
                            <div id="cameraControls">
                                <button className="btn" onClick={startCamera}>📷 Start Camera</button>
                                <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>📁 Choose File</button>
                                <input type="file" ref={fileInputRef} id="fileInput" accept="image/*" onChange={handleFileSelect} />
                            </div>
                        )}
                        
                        <video id="videoPreview" ref={videoRef} autoPlay muted playsinline style={{ display: showCaptureControls ? 'block' : 'none' }}></video>
                        
                        {showImagePreview && (
                            <img id="imagePreview" src={capturedImageDataUrl} alt="Captured or generated image" />
                        )}

                        {showCaptureControls && (
                            <div id="captureControls">
                                <button className="btn" onClick={capturePhoto}>📸 Capture</button>
                                <button className="btn btn-secondary" onClick={stopCamera}>❌ Stop</button>
                            </div>
                        )}

                        {showImagePreview && (
                            <div id="imageControls">
                                <button className="btn btn-secondary" onClick={retakePhoto}>🔄 Retake</button>
                                <button className="btn btn-success" onClick={analyzeAndGenerate} disabled={isGenerating}>
                                    {isGenerating ? 'Generating...' : (generatedImageUrl ? '✨ Regenerate' : '✨ Generate AI Version')}
                                </button>
                                {generatedImageUrl && (
                                    <>
                                        <button className="btn btn-success" onClick={saveImageToDevice}>💾 Save to Device</button>
                                        <button className="btn" onClick={addToGallery}>🖼️ Add to Gallery</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {showImagePreview && (
                        <div className="section style-selector">
                            <label>Choose Generation Style:</label>
                            <div className="style-grid">
                                {Object.entries(STYLES).map(([key, { name }]) => (
                                    <div 
                                        key={key}
                                        className={`style-option ${selectedStyle === key ? 'selected' : ''}`}
                                        data-style={key}
                                        onClick={() => setSelectedStyle(key)}
                                    >
                                        {name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {isGenerating && (
                        <div className="progress-bar" style={{ display: 'block' }}>
                            <div className="progress-fill" style={{ width: `${progress}%`, animation: 'pulse 2s infinite' }}></div>
                        </div>
                    )}

                    {status.message && (
                        <div className="status-message" style={{ display: 'block' }}>{status.message}</div>
                    )}
                </div>

                <div id="galleryTab" className={activeTab !== 'gallery' ? 'hidden' : ''}>
                    <div className="section gallery-section" style={{display: 'block'}}>
                        <h3>Community AI Gallery</h3>
                        {galleryLoading && <p style={{textAlign: 'center', marginTop: '20px'}}>Loading gallery...</p>}
                        <div className="gallery-grid">
                            {galleryItems && galleryItems.map(item => (
                                <div className="gallery-item" key={item.id} title={`Created by ${item.username}`}>
                                    <img 
                                        src={item.url} 
                                        alt={`AI Generated Image in ${item.style} style by ${item.username}`} 
                                        loading="lazy" 
                                        onClick={() => window.open(item.url, '_blank')} 
                                    />
                                    <div className="gallery-item-info">
                                        <p className="gallery-item-style">{STYLES[item.style]?.name || item.style}</p>
                                        <p className="gallery-item-user">by {item.username}</p>
                                    </div>
                                    {currentUser && item.user_id === currentUser.id && (
                                        <button 
                                            className="delete-btn" 
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent opening image when clicking delete
                                                handleDeleteFromGallery(item.id);
                                            }}
                                            title="Delete image"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {!galleryLoading && galleryItems && galleryItems.length === 0 && (
                            <div id="emptyGallery" style={{ textAlign: 'center', opacity: 0.7, marginTop: '40px' }}>
                                <p>The gallery is empty. Be the first to create something! 🎨</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);