import React, { useState, useRef, useEffect } from 'react';
import { formatBytes, WorkflowFile } from '../services/engineManager';
import { useEngineManager, useHaptics } from '../services/ServiceContext';
import { PDF_COMPRESSION_PRESETS } from '../constants/compression';
import { mapWithConcurrency, useWorkflow } from '../hooks/useWorkflow';
import {
  WorkflowDoneShell,
  WorkflowDropZone,
  WorkflowErrorBanner,
  WorkflowProgressCard,
} from './workflow/WorkflowStageUI';
import { PdfProcessResult, PdfToImagesResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import {
  FileText,
  Sparkles,
  Images,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Trash2
} from 'lucide-react';

interface SelectedImageItem {
  id: string;
  name: string;
  uri: string;
  previewUrl: string;
}

interface SelectedPdfFile {
  name: string;
  sizeBytes: number;
  uri: string;
}

type PdfSubMode = 'images_to_pdf' | 'compress_pdf' | 'pdf_to_images';

interface PdfWorkflowProps {
  sharedFile?: WorkflowFile | null;
  onSharedFileConsumed?: () => void;
}

export function PdfWorkflow({ sharedFile, onSharedFileConsumed }: PdfWorkflowProps = {}) {
  const engineManager = useEngineManager();
  const haptics = useHaptics();
  const {
    stage,
    setStage,
    progress,
    setProgress,
    errorMessage,
    isSaving,
    savedSuccess,
    beginConfigure,
    executeJob,
    cancelActiveJob,
    runSave,
    runShare,
    resetWorkflow,
  } = useWorkflow();

  const [subMode, setSubMode] = useState<PdfSubMode>('images_to_pdf');

  // Images to PDF state
  const [selectedImages, setSelectedImages] = useState<SelectedImageItem[]>([]);

  // PDF Compress / Extract state
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdfFile | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<'light' | 'balanced' | 'highly'>('balanced');
  const [extractFormat, setExtractFormat] = useState<'jpg' | 'png'>('jpg');

  // Results state
  const [pdfResult, setPdfResult] = useState<PdfProcessResult | null>(null);
  const [extractedImagesResult, setExtractedImagesResult] = useState<PdfToImagesResult | null>(null);

  const imagesInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const appendImagesRef = useRef<boolean>(false);
  const nextImageIdRef = useRef<number>(1);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sharedFile) return;
    setSubMode((prev) => (prev === 'pdf_to_images' ? 'pdf_to_images' : 'compress_pdf'));
    setSelectedImages([]);
    setSelectedPdf({
      name: sharedFile.name,
      sizeBytes: sharedFile.sizeBytes,
      uri: sharedFile.uri,
    });
    setPdfResult(null);
    setExtractedImagesResult(null);
    beginConfigure();
    onSharedFileConsumed?.();
  }, [sharedFile, onSharedFileConsumed, beginConfigure]);

  const handleSubModeChange = (mode: PdfSubMode) => {
    setSubMode(mode);
    resetWorkflow(() => {
      setSelectedImages([]);
      setSelectedPdf(null);
      setPdfResult(null);
      setExtractedImagesResult(null);
    });
  };

  const applySelectedImages = (items: SelectedImageItem[], shouldAppend: boolean) => {
    if (items.length === 0) return;
    if (shouldAppend) {
      setSelectedImages((prev) => [...prev, ...items]);
    } else {
      setSelectedImages(items);
    }
    setPdfResult(null);
    setExtractedImagesResult(null);
    beginConfigure();
  };

  const applySelectedPdf = (item: { name: string; sizeBytes: number; uri: string }) => {
    setSelectedPdf({
      name: item.name,
      sizeBytes: item.sizeBytes,
      uri: item.uri,
    });
    setPdfResult(null);
    setExtractedImagesResult(null);
    beginConfigure();
  };

  const registerImagesWebChooser = () => {
    engineManager.setPendingWebChooserHandler((resolved) => {
      const shouldAppend = appendImagesRef.current;
      appendImagesRef.current = false;
      if (resolved.length === 0) return;
      haptics.mediumImpact();
      const items = resolved.map((p) => ({
        id: `img_${Date.now()}_${nextImageIdRef.current++}`,
        name: p.name,
        uri: p.uri,
        previewUrl: p.previewUrl,
      }));
      applySelectedImages(items, shouldAppend);
    });
  };

  const registerPdfWebChooser = () => {
    engineManager.setPendingWebChooserHandler((resolved) => {
      if (resolved.length === 0) return;
      haptics.mediumImpact();
      applySelectedPdf(resolved[0]);
    });
  };

  const handleTriggerPick = async () => {
    haptics.selection();
    if (subMode === 'images_to_pdf') {
      const picked = await engineManager.pickFiles('image/*', true);
      if (picked !== null) {
        if (picked.length > 0) {
          const items = picked.map((p) => ({
            id: `img_${Date.now()}_${nextImageIdRef.current++}`,
            name: p.name,
            uri: p.uri,
            previewUrl: p.previewUrl,
          }));
          applySelectedImages(items, false);
        }
        return;
      }
      appendImagesRef.current = false;
      registerImagesWebChooser();
      imagesInputRef.current?.click();
    } else {
      const picked = await engineManager.pickFiles('application/pdf', false);
      if (picked !== null) {
        if (picked.length > 0) {
          applySelectedPdf(picked[0]);
        }
        return;
      }
      registerPdfWebChooser();
      pdfInputRef.current?.click();
    }
  };

  // Image files selected for Images to PDF
  const handleAddMoreImages = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('image/*', true);
    if (picked !== null) {
      if (picked.length > 0) {
        const items = picked.map((p) => ({
          id: `img_${Date.now()}_${nextImageIdRef.current++}`,
          name: p.name,
          uri: p.uri,
          previewUrl: p.previewUrl,
        }));
        setSelectedImages((prev) => [...prev, ...items]);
      }
      return;
    }
    appendImagesRef.current = true;
    registerImagesWebChooser();
    imagesInputRef.current?.click();
  };

  const handleImagesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const shouldAppend = appendImagesRef.current;
    appendImagesRef.current = false;
    if (!files || files.length === 0) return;

    haptics.mediumImpact();
    const cachedItems = await mapWithConcurrency(Array.from(files), 4, (file) =>
      engineManager.cacheWebFile(file)
    );
    const loadedList: SelectedImageItem[] = cachedItems.map((item) => ({
      id: `img_${Date.now()}_${nextImageIdRef.current++}`,
      name: item.name,
      uri: item.uri,
      previewUrl: item.previewUrl,
    }));

    e.target.value = '';
    applySelectedImages(loadedList, shouldAppend);
  };

  // PDF file selected for Compress or PDF to Images
  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.mediumImpact();
    const item = await engineManager.cacheWebFile(file);
    applySelectedPdf(item);
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    haptics.selection();
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedImages.length) return;

    const copy = [...selectedImages];
    const item = copy.splice(index, 1)[0];
    copy.splice(targetIdx, 0, item);
    setSelectedImages(copy);
  };

  const handleDragStart = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    draggedIdRef.current = id;
    setDraggedImageId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    haptics.selection();
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const activeId = draggedIdRef.current;
    if (!activeId) return;

    const listEl = listContainerRef.current;
    if (listEl) {
      const containerRect = listEl.getBoundingClientRect();
      if (e.clientY < containerRect.top + 28) {
        listEl.scrollTop -= 12;
      } else if (e.clientY > containerRect.bottom - 28) {
        listEl.scrollTop += 12;
      }
    }

    setSelectedImages((prev) => {
      const currentIdx = prev.findIndex((item) => item.id === activeId);
      if (currentIdx === -1) return prev;

      let targetIdx = currentIdx;
      for (let i = 0; i < prev.length; i++) {
        const row = rowRefs.current.get(prev[i].id);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (i < currentIdx && e.clientY < midY) {
          targetIdx = i;
          break;
        }
        if (i > currentIdx && e.clientY > midY) {
          targetIdx = i;
        }
      }

      if (targetIdx === currentIdx) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(currentIdx, 1);
      copy.splice(targetIdx, 0, moved);
      haptics.selection();
      return copy;
    });
  };

  const handleDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggedIdRef.current) return;
    draggedIdRef.current = null;
    setDraggedImageId(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleDragKeyDown = (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveImage(index, 'up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveImage(index, 'down');
    }
  };

  const removeImage = (index: number) => {
    haptics.selection();
    const copy = [...selectedImages];
    copy.splice(index, 1);
    setSelectedImages(copy);
    if (copy.length === 0) {
      setStage('idle');
    }
  };

  const handleStartProcessing = async () => {
    if (subMode === 'images_to_pdf' && selectedImages.length === 0) return;
    if ((subMode === 'compress_pdf' || subMode === 'pdf_to_images') && !selectedPdf) return;

    await executeJob({
      jobId: `pdf_${Date.now()}`,
      fallbackError: "that PDF's being stubborn, try another document?",
      run: async (jobId) => {
        if (subMode === 'images_to_pdf') {
          const paths = selectedImages.map((img) => img.uri);
          const res = await engineManager.imagesToPdf(
            paths,
            (p) => {
              setProgress(Math.round(p.progress * 100));
            },
            jobId
          );
          setPdfResult(res);
        } else if (subMode === 'compress_pdf' && selectedPdf) {
          const res = await engineManager.compressPdf(
            {
              jobId,
              inputPath: selectedPdf.uri,
              compressionLevel,
            },
            (p) => {
              setProgress(Math.round(p.progress * 100));
            }
          );
          setPdfResult(res);
        } else if (subMode === 'pdf_to_images' && selectedPdf) {
          const res = await engineManager.pdfToImages(
            selectedPdf.uri,
            extractFormat,
            (p) => {
              setProgress(Math.round(p.progress * 100));
            },
            jobId
          );
          setExtractedImagesResult(res);
        }
      },
    });
  };

  const handleSaveToGallery = () =>
    runSave(async () => {
      if (pdfResult) {
        await engineManager.saveOutputToGallery(
          pdfResult.outputPath,
          'pdf',
          `squishh_${Date.now()}.pdf`
        );
      } else if (extractedImagesResult) {
        for (let i = 0; i < extractedImagesResult.imagePaths.length; i++) {
          await engineManager.saveOutputToGallery(
            extractedImagesResult.imagePaths[i],
            'image',
            `squishh_page_${i + 1}_${Date.now()}.${extractFormat}`
          );
        }
      }
    }, 'failed to save PDF to downloads');

  const handleShare = () => {
    const sharePaths = pdfResult
      ? [pdfResult.outputPath]
      : extractedImagesResult?.imagePaths || [];
    if (sharePaths.length === 0) return;
    return runShare(() => engineManager.shareFiles(sharePaths, 'Squished PDF Document'));
  };

  const resetAll = () =>
    resetWorkflow(() => {
      setSelectedImages([]);
      setSelectedPdf(null);
      setPdfResult(null);
      setExtractedImagesResult(null);
    });

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Hidden file inputs */}
      <input
        ref={imagesInputRef}
        type="file"
        accept="image/*"
        multiple
        onClick={registerImagesWebChooser}
        onChange={handleImagesSelected}
        className="hidden"
        id="pdf-images-input"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        onClick={registerPdfWebChooser}
        onChange={handlePdfSelected}
        className="hidden"
        id="pdf-file-input"
      />

      {/* Sub-mode Segmented Tabs */}
      <div role="tablist" aria-label="PDF workflow mode" className="grid grid-cols-3 gap-1 p-1 bg-[#EDE8E0] dark:bg-[#24282D] rounded-2xl text-xs font-semibold">
        <button
          type="button"
          role="tab"
          aria-selected={subMode === 'images_to_pdf'}
          onClick={() => handleSubModeChange('images_to_pdf')}
          className={`py-2 px-1 rounded-xl transition-all select-none cursor-pointer ${
            subMode === 'images_to_pdf'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          Photos &rarr; PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subMode === 'compress_pdf'}
          onClick={() => handleSubModeChange('compress_pdf')}
          className={`py-2 px-1 rounded-xl transition-all select-none cursor-pointer ${
            subMode === 'compress_pdf'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          Compress PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subMode === 'pdf_to_images'}
          onClick={() => handleSubModeChange('pdf_to_images')}
          className={`py-2 px-1 rounded-xl transition-all select-none cursor-pointer ${
            subMode === 'pdf_to_images'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          PDF &rarr; Images
        </button>
      </div>

      <WorkflowErrorBanner message={errorMessage} />

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <WorkflowDropZone
          onClick={handleTriggerPick}
          icon={subMode === 'images_to_pdf' ? <Images className="w-7 h-7" /> : <FileText className="w-7 h-7" />}
          title={
            subMode === 'images_to_pdf'
              ? 'pick photos to combine into PDF'
              : subMode === 'compress_pdf'
              ? 'pick PDF to compress'
              : 'pick PDF to extract page images'
          }
          subtitle={
            subMode === 'images_to_pdf'
              ? 'select camera shots or receipts • reorder pages freely'
              : 'shrink under portal limits (2 MB, 1 MB) • 100% offline'
          }
          buttonLabel={subMode === 'images_to_pdf' ? 'select photos' : 'select PDF file'}
        />
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && (
        <div className="flex flex-col gap-4">
          {/* Sub-mode 1: Images to PDF page reorder card (drag + arrow controls) */}
          {subMode === 'images_to_pdf' && selectedImages.length > 0 && (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#767B77] dark:text-[#949995]">
                  {selectedImages.length} pages &bull; drag or tap arrows to reorder
                </span>
                <button
                  type="button"
                  onClick={handleAddMoreImages}
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline cursor-pointer"
                >
                  add more
                </button>
              </div>

              {/* Reorderable page list */}
              <div
                ref={listContainerRef}
                role="list"
                aria-label="PDF pages in order"
                className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1"
              >
                {selectedImages.map((img, idx) => {
                  const isDragging = draggedImageId === img.id;
                  return (
                    <div
                      key={img.id}
                      role="listitem"
                      ref={(node) => {
                        if (node) rowRefs.current.set(img.id, node);
                        else rowRefs.current.delete(img.id);
                      }}
                      className={`flex items-center gap-2.5 p-2 rounded-2xl border transition-all ${
                        isDragging
                          ? 'bg-[#EDE8E0] dark:bg-[#24282D] border-[#4A6B53] dark:border-[#76A183] shadow-md scale-[1.01] z-10'
                          : 'bg-[#FBF9F5] dark:bg-[#141618] border-[#E5DFD5] dark:border-[#2D3238]'
                      }`}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Reorder page ${idx + 1}, ${img.name}. Drag or press Arrow Up or Arrow Down.`}
                        onPointerDown={(e) => handleDragStart(img.id, e)}
                        onPointerMove={handleDragMove}
                        onPointerUp={handleDragEnd}
                        onPointerCancel={handleDragEnd}
                        onKeyDown={(e) => handleDragKeyDown(idx, e)}
                        className="p-1.5 rounded-lg text-[#767B77] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] touch-none select-none cursor-grab active:cursor-grabbing flex-shrink-0"
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="w-6 text-center font-mono font-bold text-xs text-[#767B77]">
                        #{idx + 1}
                      </span>
                      <img
                        src={img.previewUrl}
                        alt={`Page ${idx + 1}: ${img.name}`}
                        className="w-10 h-10 rounded-xl object-cover border border-[#E5DFD5] dark:border-[#2D3238]"
                      />
                      <span className="flex-1 min-w-0 text-xs font-semibold truncate">
                        {img.name}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg hover:bg-[#EDE8E0] dark:hover:bg-[#24282D] disabled:opacity-30 cursor-pointer"
                          aria-label={`Move ${img.name} up from page ${idx + 1}`}
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'down')}
                          disabled={idx === selectedImages.length - 1}
                          className="p-1.5 rounded-lg hover:bg-[#EDE8E0] dark:hover:bg-[#24282D] disabled:opacity-30 cursor-pointer"
                          aria-label={`Move ${img.name} down from page ${idx + 1}`}
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="p-1.5 rounded-lg hover:bg-[#F6D6C6] dark:hover:bg-[#4A352D] text-[#4A352D] dark:text-[#F6D6C6] cursor-pointer"
                          aria-label={`Remove ${img.name} (page ${idx + 1})`}
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-mode 2: Compress PDF options */}
          {subMode === 'compress_pdf' && selectedPdf && (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <FileText className="w-6 h-6 text-[#4A6B53] dark:text-[#76A183]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedPdf.name}</p>
                  <p className="text-xs text-[#767B77] dark:text-[#949995]">
                    original: {formatBytes(selectedPdf.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerPick}
                  aria-label="Change selected PDF document"
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline cursor-pointer"
                >
                  change
                </button>
              </div>

              {/* 3 Compression Options */}
              <span className="text-xs font-semibold text-[#767B77] dark:text-[#949995] block">
                compression level
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {PDF_COMPRESSION_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={compressionLevel === item.id}
                    onClick={() => {
                      setCompressionLevel(item.id);
                      haptics.selection();
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all select-none cursor-pointer ${
                      compressionLevel === item.id
                        ? 'border-[#4A6B53] dark:border-[#76A183] bg-[#4A6B53]/10 dark:bg-[#76A183]/15 shadow-sm'
                        : 'bg-[#FBF9F5] dark:bg-[#141618] border-[#E5DFD5] dark:border-[#2D3238] hover:border-[#767B77]'
                    }`}
                  >
                    <div className="font-bold text-sm text-[#2C302E] dark:text-[#EDE9E3]">{item.label}</div>
                    <div className="text-xs font-semibold text-[#4A6B53] dark:text-[#76A183] mt-0.5">{item.reduction}</div>
                    <div className="text-[10px] text-[#767B77] dark:text-[#949995] mt-1">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-mode 3: PDF to Images options */}
          {subMode === 'pdf_to_images' && selectedPdf && (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <FileText className="w-6 h-6 text-[#4A6B53] dark:text-[#76A183]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedPdf.name}</p>
                  <p className="text-xs text-[#767B77] dark:text-[#949995]">
                    original: {formatBytes(selectedPdf.sizeBytes)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <span className="text-xs font-semibold">export format:</span>
                <div className="flex gap-1.5">
                  {(['jpg', 'png'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      aria-pressed={extractFormat === fmt}
                      onClick={() => {
                        setExtractFormat(fmt);
                        haptics.selection();
                      }}
                      className={`py-1 px-3 rounded-lg text-xs font-bold uppercase transition-all select-none cursor-pointer ${
                        extractFormat === fmt
                          ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512]'
                          : 'bg-[#EDE8E0] dark:bg-[#24282D] text-[#767B77]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          <SquishhButton
            size="lg"
            variant="primary"
            onClick={handleStartProcessing}
            icon={<Sparkles className="w-5 h-5" />}
            className="w-full mt-2"
          >
            {subMode === 'images_to_pdf'
              ? `generate ${selectedImages.length}-page PDF`
              : subMode === 'compress_pdf'
              ? 'squish PDF document'
              : 'extract all pages to images'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 3: PROCESSING */}
      {stage === 'processing' && (
        <WorkflowProgressCard
          iconSlot={
            <div className="w-16 h-16 rounded-2xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183] mb-4 animate-pulse shadow-sm">
              <FileText className="w-8 h-8" />
            </div>
          }
          title={
            subMode === 'images_to_pdf'
              ? 'rendering PDF pages…'
              : subMode === 'compress_pdf'
              ? 'squishing PDF document…'
              : 'extracting high-res images…'
          }
          subtitle="native Android PdfRenderer • 100% offline"
          progress={progress}
          onCancel={cancelActiveJob}
        />
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && (pdfResult || extractedImagesResult) && (
        <WorkflowDoneShell
          subtitle={
            subMode === 'images_to_pdf'
              ? `compiled ${pdfResult?.pageCount} pages into PDF`
              : subMode === 'compress_pdf'
              ? 'PDF successfully squished'
              : `extracted ${extractedImagesResult?.pageCount} page images`
          }
          savings={
            pdfResult
              ? {
                  originalBytes: pdfResult.originalSizeBytes,
                  compressedBytes: pdfResult.compressedSizeBytes,
                  requirePositivePercent: true,
                }
              : undefined
          }
          saveLabel={subMode === 'pdf_to_images' ? 'save all images to gallery' : 'save PDF to downloads'}
          savingLabel="saving…"
          savedLabel="saved to downloads ✓"
          isSaving={isSaving}
          savedSuccess={savedSuccess}
          onSave={handleSaveToGallery}
          shareLabel={subMode === 'pdf_to_images' ? 'share images' : 'share PDF document'}
          onShare={handleShare}
          resetLabel="squish another document"
          onReset={resetAll}
        >
          {/* Metadata summary */}
          <div className="grid grid-cols-2 gap-2 w-full text-xs text-left mb-4">
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">PAGES</span>
              <span className="font-bold">
                {pdfResult ? pdfResult.pageCount : extractedImagesResult?.pageCount} pages
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">OUTPUT SIZE</span>
              <span className="font-mono font-bold">
                {formatBytes(pdfResult ? pdfResult.compressedSizeBytes : extractedImagesResult?.totalSizeBytes || 0)}
              </span>
            </div>
          </div>
        </WorkflowDoneShell>
      )}
    </div>
  );
}
