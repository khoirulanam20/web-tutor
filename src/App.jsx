import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, MoveUp, MoveDown, FileDown, Camera,
  Image as ImageIcon, Check, MousePointer2, Highlighter,
  X, Loader2, UploadCloud, FileCode, MoveRight, FileText,
  Save, RotateCcw, Sparkles // Menambahkan icon Save, RotateCcw, dan Sparkles
} from 'lucide-react';
import { getStepDescriptionFromImage } from './services/gemini';

const App = () => {
  // --- KONFIGURASI STORAGE ---
  const STORAGE_PREFIX = 'scribe_clone_v1_';

  // Helper untuk load data dari localStorage dengan aman
  const loadFromStorage = (key, defaultValue) => {
    try {
      const savedItem = localStorage.getItem(STORAGE_PREFIX + key);
      return savedItem ? JSON.parse(savedItem) : defaultValue;
    } catch (e) {
      console.error("Gagal memuat data:", e);
      return defaultValue;
    }
  };

  // --- STATE ---
  // Inisialisasi state menggunakan function agar hanya dijalankan sekali saat mount (Lazy Initialization)
  const [guideTitle, setGuideTitle] = useState(() => loadFromStorage('title', 'Cara Menggunakan Aplikasi Saya'));
  const [authorName, setAuthorName] = useState(() => loadFromStorage('author', 'Creator'));

  const [steps, setSteps] = useState(() => loadFromStorage('steps', [
    {
      id: 1,
      title: 'Buka Halaman Utama',
      description: 'Navigasikan browser Anda ke halaman dashboard utama aplikasi.',
      image: null,
      annotations: []
    }
  ]));

  // State untuk Status Penyimpanan
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

  const [isPdfReady, setIsPdfReady] = useState(false);
  const [isDocxReady, setIsDocxReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHtmlGenerating, setIsHtmlGenerating] = useState(false);
  const [isDocxGenerating, setIsDocxGenerating] = useState(false);

  // State untuk Drag & Drop visual
  const [dragActiveStepId, setDragActiveStepId] = useState(null);

  // State untuk Modal Editor Gambar
  const [editingStepId, setEditingStepId] = useState(null);
  const [activeTool, setActiveTool] = useState('click'); // 'click' | 'highlight' | 'arrow'

  // State untuk Drawing (Highlight & Arrow)
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null); // {x, y}
  const [currentPos, setCurrentPos] = useState(null); // {x, y}

  // State untuk melacak langkah yang sedang diproses oleh AI
  const [processingAiSteps, setProcessingAiSteps] = useState([]); // Array of IDs

  // --- EFEK: AUTO SAVE ---
  useEffect(() => {
    const saveData = () => {
      setSaveStatus('saving');
      try {
        localStorage.setItem(STORAGE_PREFIX + 'title', JSON.stringify(guideTitle));
        localStorage.setItem(STORAGE_PREFIX + 'author', JSON.stringify(authorName));
        localStorage.setItem(STORAGE_PREFIX + 'steps', JSON.stringify(steps));

        // Simulasi delay sedikit agar status 'saving' terlihat oleh user
        setTimeout(() => setSaveStatus('saved'), 600);
      } catch (e) {
        console.error("Gagal menyimpan:", e);
        setSaveStatus('error');
        if (e.name === 'QuotaExceededError') {
          alert("Penyimpanan Browser Penuh! Gambar yang Anda masukkan terlalu banyak atau terlalu besar. Hapus beberapa langkah untuk menyimpan kembali.");
        }
      }
    };

    // Debounce: Tunggu 800ms setelah user berhenti mengetik/mengubah data sebelum menyimpan
    const timeoutId = setTimeout(saveData, 800);
    return () => clearTimeout(timeoutId);

  }, [guideTitle, authorName, steps]);

  // Load External Libraries (jsPDF & docx)
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    // Load jsPDF
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      .then(() => setIsPdfReady(true))
      .catch(err => console.error("Gagal memuat library PDF", err));

    // Load docx (Versi UMD untuk browser)
    loadScript('https://unpkg.com/docx@7.1.0/build/index.js')
      .then(() => setIsDocxReady(true))
      .catch(err => console.error("Gagal memuat library DOCX", err));
  }, []);

  // --- LOGIKA RESET ---
  const handleReset = () => {
    if (window.confirm("Apakah Anda yakin ingin menghapus semua data dan memulai dari awal? Tindakan ini tidak bisa dibatalkan.")) {
      localStorage.removeItem(STORAGE_PREFIX + 'title');
      localStorage.removeItem(STORAGE_PREFIX + 'author');
      localStorage.removeItem(STORAGE_PREFIX + 'steps');

      setGuideTitle('Panduan Baru');
      setAuthorName('Creator');
      setSteps([{
        id: 1,
        title: 'Langkah Awal',
        description: 'Mulai dokumentasi Anda di sini.',
        image: null,
        annotations: []
      }]);
      setSaveStatus('saved');
    }
  };

  // --- LOGIKA STEP ---

  const addStep = () => {
    setSteps(prevSteps => {
      const newId = prevSteps.length > 0 ? Math.max(...prevSteps.map(s => s.id)) + 1 : 1;
      return [...prevSteps, {
        id: newId,
        title: `Langkah ${prevSteps.length + 1}`,
        description: '',
        image: null,
        annotations: []
      }];
    });
  };

  const deleteStep = (id) => {
    setSteps(prevSteps => prevSteps.filter(s => s.id !== id));
  };

  const moveStep = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;

    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
      return newSteps;
    });
  };

  const updateStep = (id, field, value) => {
    setSteps(prevSteps => prevSteps.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const handleAiDescribe = async (id, step) => {
    if (!step?.image) {
      alert("Unggah gambar terlebih dahulu untuk menggunakan AI.");
      return;
    }

    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      alert("API Key Gemini belum disetel di .env");
      return;
    }

    setProcessingAiSteps(prev => [...prev, id]);
    try {
      // Buat gambar yang sudah ada anotasinya (flat version)
      const flattenedImage = await flattenImageForExport(step.image, step.annotations);
      const aiDescription = await getStepDescriptionFromImage(flattenedImage);

      if (aiDescription) {
        updateStep(id, 'description', aiDescription);
      }
    } catch (error) {
      console.error("Gagal generate deskripsi:", error);
    } finally {
      setProcessingAiSteps(prev => prev.filter(stepId => stepId !== id));
    }
  };

  // --- LOGIKA GAMBAR ---

  const handleImageUpload = (id, file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target.result;

        // Update gambar di state (tanpa AI otomatis)
        setSteps(prevSteps => prevSteps.map(s => {
          if (s.id === id) {
            return {
              ...s,
              image: base64Image,
              annotations: []
            };
          }
          return s;
        }));
      };
      reader.readAsDataURL(file);
    } else {
      if (file) alert("Mohon upload file gambar yang valid (JPG, PNG).");
    }
  };

  const handlePaste = (id, e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        handleImageUpload(id, blob);
        break;
      }
    }
  };

  const handleDragEnter = (e, id) => { e.preventDefault(); e.stopPropagation(); setDragActiveStepId(id); };
  const handleDragLeave = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragActiveStepId(null);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setDragActiveStepId(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(id, e.dataTransfer.files[0]);
    }
  };

  // --- LOGIKA ANOTASI ---

  const getRelativeCoords = (e) => {
    const rect = e.target.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  const handleMouseDown = (e) => {
    if (activeTool === 'highlight' || activeTool === 'arrow') {
      e.preventDefault();
      setIsDrawing(true);
      const coords = getRelativeCoords(e);
      setStartPos(coords);
      setCurrentPos(coords);
    }
  };

  const handleMouseMove = (e) => {
    if (isDrawing && (activeTool === 'highlight' || activeTool === 'arrow')) {
      setCurrentPos(getRelativeCoords(e));
    }
  };

  const handleMouseUp = (e, stepId) => {
    // Jika tidak sedang drawing dan bukan tool click, abaikan
    if (!isDrawing && activeTool !== 'click') return;

    if (activeTool === 'arrow') {
      setIsDrawing(false);
      const startX = startPos.x;
      const startY = startPos.y;
      const endX = currentPos.x;
      const endY = currentPos.y;

      const dist = Math.hypot(endX - startX, endY - startY);
      if (dist < 2) {
        setStartPos(null);
        setCurrentPos(null);
        return;
      }

      addAnnotation(stepId, 'arrow', startX, startY, endX, endY);
      setStartPos(null);
      setCurrentPos(null);

    } else if (activeTool === 'highlight') {
      setIsDrawing(false);

      const x1 = startPos.x;
      const y1 = startPos.y;
      const x2 = currentPos.x;
      const y2 = currentPos.y;

      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      if (width < 1 || height < 1) {
        setStartPos(null);
        setCurrentPos(null);
        return;
      }

      const centerX = Math.min(x1, x2) + width / 2;
      const centerY = Math.min(y1, y2) + height / 2;

      addAnnotation(stepId, 'highlight', centerX, centerY, width, height);
      setStartPos(null);
      setCurrentPos(null);

    } else if (activeTool === 'click') {
      const coords = getRelativeCoords(e);
      addAnnotation(stepId, 'click', coords.x, coords.y);
    }
  };

  const addAnnotation = (stepId, type, x, y, width = null, height = null) => {
    setSteps(prevSteps => prevSteps.map(s => {
      if (s.id === stepId) {
        const newAnnotation = {
          id: Date.now(),
          type,
          x,
          y,
          width,
          height
        };
        return { ...s, annotations: [...s.annotations, newAnnotation] };
      }
      return s;
    }));
  };

  const removeAnnotation = (stepId, annotationId) => {
    setSteps(prevSteps => prevSteps.map(s => {
      if (s.id === stepId) {
        return { ...s, annotations: s.annotations.filter(a => a.id !== annotationId) };
      }
      return s;
    }));
  };

  // --- HELPER PDF & HTML & DOCX ---
  const flattenImageForExport = (imgUrl, annotations) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        annotations.forEach(ann => {
          const x = (ann.x / 100) * canvas.width;
          const y = (ann.y / 100) * canvas.height;

          if (ann.type === 'click') {
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, 2 * Math.PI);
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#f97316';
            ctx.stroke();
            ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
            ctx.fill();
          } else if (ann.type === 'highlight') {
            const w = ann.width ? (ann.width / 100) * canvas.width : 200;
            const h = ann.height ? (ann.height / 100) * canvas.height : 50;

            ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
            ctx.fillRect(x - (w / 2), y - (h / 2), w, h);
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 3;
            ctx.strokeRect(x - (w / 2), y - (h / 2), w, h);
          } else if (ann.type === 'arrow') {
            const startX = x;
            const startY = y;
            const endX = (ann.width / 100) * canvas.width;
            const endY = (ann.height / 100) * canvas.height;
            const headLength = 20;

            const dx = endX - startX;
            const dy = endY - startY;
            const angle = Math.atan2(dy, dx);

            ctx.beginPath();
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#f43f5e';
            ctx.lineCap = 'round';

            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          }
        });
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.crossOrigin = "Anonymous";
      img.src = imgUrl;
    });
  };

  // Helper konversi Base64 ke Uint8Array untuk DOCX
  const base64ToUint8Array = (base64) => {
    const binaryString = window.atob(base64.split(',')[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // --- GENERATE HTML ---
  const generateHTML = async () => {
    setIsHtmlGenerating(true);

    const stepsWithBakedImages = await Promise.all(steps.map(async (step) => {
      let finalImage = null;
      if (step.image) {
        finalImage = step.annotations.length > 0
          ? await flattenImageForExport(step.image, step.annotations)
          : step.image;
      }
      return { ...step, finalImage };
    }));

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${guideTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background: #f8fafc; }
          .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
          header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0; color: #1e293b; font-size: 2em; }
          .meta { color: #64748b; font-size: 0.9em; margin-top: 8px; }
          .step { margin-bottom: 50px; }
          .step-header { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 15px; }
          .step-number { background: #4f46e5; color: white; font-weight: bold; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; font-size: 14px; }
          .step-content { flex: 1; }
          .step-title { font-size: 1.25em; font-weight: bold; color: #1e293b; margin: 0 0 8px 0; }
          .step-desc { color: #475569; margin-bottom: 20px; font-size: 1rem; }
          .step-image { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          img { display: block; width: 100%; height: auto; }
          footer { text-align: center; font-size: 0.8em; color: #94a3b8; margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          
          ${stepsWithBakedImages.map((step, index) => `
            <div class="step">
              <div class="step-header">
                <div class="step-number">${index + 1}</div>
                <div class="step-content">
                  <h3 class="step-title">${step.title}</h3>
                  <div class="step-desc">${step.description}</div>
                  ${step.finalImage ? `
                    <div class="step-image">
                      <img src="${step.finalImage}" alt="Langkah ${index + 1}" />
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${guideTitle.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsHtmlGenerating(false);
  };

  // --- GENERATE WORD (DOCX) ---
  const generateDOCX = async () => {
    if (!window.docx) {
      alert("Library Word belum siap. Mohon tunggu sebentar.");
      return;
    }

    setIsDocxGenerating(true);
    const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = window.docx;

    const docChildren = [];

    // --- Header Document ---
    docChildren.push(
      new Paragraph({
        text: guideTitle,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );

    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Dibuat oleh: ${authorName} | ${new Date().toLocaleDateString('id-ID')}`,
            color: "666666",
            italics: true,
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    );

    // --- Steps Loop ---
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Judul Langkah
      docChildren.push(
        new Paragraph({
          text: `${i + 1}. ${step.title}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 100 }
        })
      );

      // Deskripsi
      docChildren.push(
        new Paragraph({
          text: step.description,
          spacing: { after: 200 }
        })
      );

      // Gambar (Jika ada)
      if (step.image) {
        try {
          const processedImage = step.annotations.length > 0
            ? await flattenImageForExport(step.image, step.annotations)
            : step.image;

          const imageBuffer = base64ToUint8Array(processedImage);

          docChildren.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 500, // Ukuran di Word
                    height: 350 // Estimasi, Word akan menjaga aspect ratio jika hanya width di set, tapi library kadang butuh keduanya.
                  }
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            })
          );
        } catch (e) {
          console.error("Gagal memproses gambar untuk DOCX", e);
        }
      }
    }

    // Buat Document
    const doc = new Document({
      sections: [{
        properties: {},
        children: docChildren,
      }],
    });

    // Generate & Download
    Packer.toBlob(doc).then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${guideTitle.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setIsDocxGenerating(false);
    });
  };

  // --- GENERATE PDF ---
  const generatePDF = async () => {
    if (!window.jspdf) {
      alert("Library PDF belum siap.");
      return;
    }

    setIsGenerating(true);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxContentWidth = pageWidth - (margin * 2);
    let yPos = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(guideTitle, margin, yPos);

    yPos += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Dibuat oleh: ${authorName} | ${new Date().toLocaleDateString('id-ID')}`, margin, yPos);

    yPos += 6;
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 15;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      doc.setTextColor(79, 70, 229);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}.`, margin, yPos);

      doc.setTextColor(30);
      doc.setFontSize(14);
      doc.text(step.title, margin + 10, yPos);

      yPos += 7;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      const splitDesc = doc.splitTextToSize(step.description, maxContentWidth - 5);
      doc.text(splitDesc, margin, yPos);

      yPos += (splitDesc.length * 5) + 5;

      if (step.image) {
        try {
          const processedImage = step.annotations.length > 0
            ? await flattenImageForExport(step.image, step.annotations)
            : step.image;

          const imgProps = doc.getImageProperties(processedImage);
          const imgRatio = imgProps.height / imgProps.width;

          const imgDisplayWidth = maxContentWidth * 0.7;
          const imgDisplayHeight = imgDisplayWidth * imgRatio;

          const imgX = margin + (maxContentWidth - imgDisplayWidth) / 2;

          if (yPos + imgDisplayHeight > 280) {
            doc.addPage();
            yPos = 20;
          }

          doc.addImage(processedImage, 'JPEG', imgX, yPos, imgDisplayWidth, imgDisplayHeight);

          doc.setDrawColor(230);
          doc.rect(imgX, yPos, imgDisplayWidth, imgDisplayHeight);

          yPos += imgDisplayHeight + 15;
        } catch (e) { console.error("Error PDF", e); }
      } else {
        yPos += 10;
      }
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - margin, 285, { align: 'right' });
      doc.text("Dibuat dengan Scribe Clone", margin, 285, { align: 'left' });
    }

    doc.save(`${guideTitle.replace(/\s+/g, '_')}.pdf`);
    setIsGenerating(false);
  };

  // --- RENDER HELPERS ---
  const renderAnnotationOverlay = (step) => {
    return (
      <>
        {/* SVG Layer untuk Arrows */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <marker id="arrowhead-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L6,3 z" fill="#f43f5e" />
            </marker>
          </defs>

          {step.annotations.filter(a => a.type === 'arrow').map(ann => (
            <line
              key={ann.id}
              x1={`${ann.x}%`}
              y1={`${ann.y}%`}
              x2={`${ann.width}%`}
              y2={`${ann.height}%`}
              stroke="#f43f5e"
              strokeWidth="4"
              markerEnd="url(#arrowhead-red)"
            />
          ))}

          {/* Render Arrow Preview */}
          {editingStepId === step.id && isDrawing && activeTool === 'arrow' && startPos && currentPos && (
            <line
              x1={`${startPos.x}%`}
              y1={`${startPos.y}%`}
              x2={`${currentPos.x}%`}
              y2={`${currentPos.y}%`}
              stroke="#f43f5e"
              strokeWidth="4"
              strokeDasharray="5,5"
              markerEnd="url(#arrowhead-red)"
            />
          )}
        </svg>

        {/* DOM Layer untuk Click & Highlight */}
        {step.annotations.map((ann) => {
          // ARROW LOGIC 
          if (ann.type === 'arrow') {
            const midX = (ann.x + ann.width) / 2;
            const midY = (ann.y + ann.height) / 2;
            return (
              <div
                key={ann.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group pointer-events-auto"
                style={{ left: `${midX}%`, top: `${midY}%` }}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-4 h-4 bg-white border-2 border-rose-500 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform"></div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeAnnotation(step.id, ann.id); }}
                  className="absolute -top-4 -right-4 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity scale-75 hover:scale-100 shadow-md z-10"
                  title="Hapus Panah"
                >
                  <X size={12} />
                </button>
              </div>
            );
          }

          // CLICK LOGIC 
          if (ann.type === 'click') {
            return (
              <div
                key={ann.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group pointer-events-auto"
                style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-8 h-8 rounded-full border-4 border-orange-500 bg-orange-500/20 shadow-lg animate-pulse"></div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeAnnotation(step.id, ann.id); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity scale-75 hover:scale-100 shadow-md z-10"
                  title="Hapus Penanda"
                >
                  <X size={12} />
                </button>
              </div>
            );
          }

          // HIGHLIGHT LOGIC
          return (
            <div
              key={ann.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${ann.x}%`,
                top: `${ann.y}%`,
                width: ann.type === 'highlight' && ann.width ? `${ann.width}%` : undefined,
                height: ann.type === 'highlight' && ann.height ? `${ann.height}%` : undefined
              }}
              onMouseUp={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="w-full h-full bg-yellow-400/40 border-2 border-yellow-500 shadow-sm relative group pointer-events-auto">
                <button onClick={(e) => { e.stopPropagation(); removeAnnotation(step.id, ann.id); }} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity scale-75 hover:scale-100 shadow-md"><X size={12} /></button>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-32">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">S</div>
          <div className="flex flex-col">
            <input
              value={guideTitle}
              onChange={(e) => setGuideTitle(e.target.value)}
              className="text-lg font-bold bg-transparent border-none focus:ring-0 p-0 w-64 md:w-80 placeholder-slate-400"
              placeholder="Judul Panduan"
            />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <span>Oleh:</span>
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 p-0 w-32 text-slate-600 font-medium placeholder-slate-300"
                  placeholder="Nama Penulis"
                />
              </div>

              {/* INDIKATOR STATUS SIMPAN */}
              <div className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 size={12} className="animate-spin text-slate-500" />
                    <span className="text-slate-500">Menyimpan...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <Check size={12} className="text-green-500" />
                    <span className="text-green-600 font-medium">Tersimpan</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <X size={12} className="text-red-500" />
                    <span className="text-red-600">Gagal Simpan</span>
                  </>
                )}
                {saveStatus === 'idle' && <span className="text-slate-400">Siap</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {/* TOMBOL RESET / NEW */}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-slate-600 hover:bg-slate-100 hover:text-red-600 transition-colors text-sm font-medium mr-2 border border-transparent hover:border-slate-200"
            title="Reset / Buat Baru (Hapus Data)"
          >
            <RotateCcw size={16} />
            <span className="hidden md:inline">Reset</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

          {/* TOMBOL EXPORT HTML */}
          <button
            onClick={generateHTML}
            disabled={isHtmlGenerating}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white border border-indigo-200 text-indigo-700 font-medium hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isHtmlGenerating ? <Loader2 className="animate-spin" size={16} /> : <FileCode size={16} />}
            <span className="hidden md:inline">HTML</span>
          </button>

          {/* TOMBOL EXPORT DOCX */}
          <button
            onClick={generateDOCX}
            disabled={!isDocxReady || isDocxGenerating}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isDocxGenerating ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            <span className="hidden md:inline">Word</span>
          </button>

          {/* TOMBOL EXPORT PDF */}
          <button
            onClick={generatePDF}
            disabled={!isPdfReady || isGenerating}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
            <span className="hidden md:inline">PDF</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto mt-8 px-4 space-y-8">
        {steps.map((step, index) => (
          <div key={step.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md" onPaste={(e) => handlePaste(step.id, e)} tabIndex={0}>
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">{index + 1}</div>
                <span className="text-sm font-medium text-slate-500">Langkah {index + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveStep(index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-slate-200 rounded text-slate-500"><MoveUp size={16} /></button>
                <button onClick={() => moveStep(index, 'down')} disabled={index === steps.length - 1} className="p-1.5 hover:bg-slate-200 rounded text-slate-500"><MoveDown size={16} /></button>
                <button onClick={() => deleteStep(step.id)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="p-5">
              <input value={step.title} onChange={(e) => updateStep(step.id, 'title', e.target.value)} className="w-full font-bold text-lg mb-2 text-slate-800 border-none p-0 focus:ring-0 placeholder-slate-300" placeholder="Judul langkah..." />
              <div className="relative group">
                <textarea
                  value={step.description}
                  onChange={(e) => updateStep(step.id, 'description', e.target.value)}
                  className={`w-full text-slate-600 resize-none border-none p-0 focus:ring-0 text-sm mb-4 ${processingAiSteps.includes(step.id) ? 'opacity-50' : ''}`}
                  rows={2}
                  placeholder={processingAiSteps.includes(step.id) ? "AI sedang berpikir..." : "Deskripsi langkah..."}
                  disabled={processingAiSteps.includes(step.id)}
                />
                {processingAiSteps.includes(step.id) ? (
                  <div className="absolute top-0 right-0 flex items-center gap-1 text-[10px] text-indigo-500 font-medium animate-pulse">
                    <Sparkles size={12} /> Gemini AI
                  </div>
                ) : (
                  <button
                    onClick={() => handleAiDescribe(step.id, step)}
                    className="absolute top-0 right-0 p-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                    title="Generate deskripsi dengan AI berdasarkan anotasi"
                  >
                    <Sparkles size={14} />
                  </button>
                )}
              </div>

              <div className={`relative group/image min-h-[150px] rounded-lg border-2 transition-all ${dragActiveStepId === step.id ? 'border-indigo-500 bg-indigo-50 border-solid' : 'border-slate-200 bg-slate-50 border-dashed'}`} onDragEnter={(e) => handleDragEnter(e, step.id)} onDragLeave={(e) => handleDragLeave(e, step.id)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, step.id)}>
                {step.image ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <img src={step.image} alt="Step" className="w-full h-auto" />
                    {renderAnnotationOverlay(step)}
                    {dragActiveStepId === step.id && (<div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center pointer-events-none z-10"><div className="bg-white px-4 py-2 rounded-full font-bold text-indigo-600 shadow-lg">Lepaskan untuk ganti gambar</div></div>)}
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/image:opacity-100 transition-opacity">
                      <button onClick={() => setEditingStepId(step.id)} className="bg-white/90 backdrop-blur text-indigo-600 px-3 py-1.5 rounded-lg shadow-sm text-xs font-bold flex items-center gap-2 hover:bg-white z-20"><MousePointer2 size={14} /> Edit Anotasi</button>
                      <label className="bg-white/90 backdrop-blur text-slate-600 px-3 py-1.5 rounded-lg shadow-sm text-xs font-bold flex items-center gap-2 hover:bg-white cursor-pointer z-20"><Camera size={14} /> Ganti<input type="file" accept="image/*" className="hidden" onChange={(e) => { handleImageUpload(step.id, e.target.files[0]); e.target.value = null; }} /></label>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center relative">
                    {dragActiveStepId === step.id ? <UploadCloud className="w-12 h-12 text-indigo-500 mb-3 animate-bounce" /> : <ImageIcon className="w-10 h-10 text-slate-300 mb-3" />}
                    <p className="text-sm font-medium text-slate-500">{dragActiveStepId === step.id ? "Lepaskan file di sini" : <>Klik, Drag & Drop, atau <span className="text-indigo-600">Paste (Ctrl+V)</span></>}</p>
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" onChange={(e) => { handleImageUpload(step.id, e.target.files[0]); e.target.value = null; }} onDragEnter={(e) => handleDragEnter(e, step.id)} onDragLeave={(e) => handleDragLeave(e, step.id)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, step.id)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <button onClick={addStep} className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-xl flex items-center justify-center gap-2 text-indigo-600 font-medium hover:bg-indigo-50 transition-all"><Plus size={20} /> Tambah Langkah Baru</button>
      </main>

      {/* --- MODAL EDITOR ANOTASI --- */}
      {editingStepId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-700">Edit Anotasi</h3>
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">

                {/* TOOL: CLICK */}
                <button
                  onClick={() => { setActiveTool('click'); setIsDrawing(false); }}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 ${activeTool === 'click' ? 'bg-orange-100 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <MousePointer2 size={16} /> Klik
                </button>

                {/* TOOL: HIGHLIGHT */}
                <button
                  onClick={() => { setActiveTool('highlight'); setIsDrawing(false); }}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 ${activeTool === 'highlight' ? 'bg-yellow-100 text-yellow-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Highlighter size={16} /> Highlight
                </button>

                {/* TOOL: ARROW (NEW) */}
                <button
                  onClick={() => { setActiveTool('arrow'); setIsDrawing(false); }}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 ${activeTool === 'arrow' ? 'bg-rose-100 text-rose-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <MoveRight size={16} /> Panah
                </button>
              </div>
              <button onClick={() => setEditingStepId(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><Check size={20} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900 flex items-center justify-center p-8 relative">
              {(() => {
                const step = steps.find(s => s.id === editingStepId);
                return step?.image ? (
                  <div className="relative shadow-2xl inline-block select-none"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={(e) => handleMouseUp(e, step.id)}
                  >
                    <img
                      src={step.image}
                      className={`max-w-full max-h-[70vh] object-contain ${activeTool !== 'click' ? 'cursor-crosshair' : 'cursor-pointer'}`}
                      alt="Edit area"
                      draggable={false}
                    />

                    {/* Menggunakan helper render overlay yang sama untuk konsistensi */}
                    {renderAnnotationOverlay(step)}

                    {/* Render Active Drawing Selection untuk Highlight Box */}
                    {isDrawing && activeTool === 'highlight' && startPos && currentPos && (
                      <div
                        className="absolute bg-yellow-400/40 border-2 border-yellow-500 shadow-sm pointer-events-none"
                        style={{
                          left: `${Math.min(startPos.x, currentPos.x)}%`,
                          top: `${Math.min(startPos.y, currentPos.y)}%`,
                          width: `${Math.abs(currentPos.x - startPos.x)}%`,
                          height: `${Math.abs(currentPos.y - startPos.y)}%`
                        }}
                      ></div>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
            <div className="bg-slate-50 px-4 py-2 text-xs text-center text-slate-500 border-t border-slate-200">
              {activeTool === 'click' && "Klik untuk menandai target klik."}
              {activeTool === 'highlight' && "Tahan dan geser (drag) mouse untuk membuat kotak highlight."}
              {activeTool === 'arrow' && "Tahan dan geser (drag) untuk menarik panah dari titik awal ke tujuan."}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;