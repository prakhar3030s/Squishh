import React, { useState, useRef } from 'react';
import { engineManager, formatBytes, humanizeError } from '../services/engineManager';
import { haptics } from '../services/haptics';
import { PdfProcessResult, PdfToImagesResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import {
  FileText,
  CheckCircle2,
  Share2,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Images,
  ArrowUp,
  ArrowDown,
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

export function PdfWorkflow() {
  const [subMode, setSubMode] = useState<PdfSubMode>('images_to_pdf');
  const [stage, setStage] = useState<'idle' | 'configuring' | 'processing' | 'done'>('idle');

  // Images to PDF state
  const [selectedImages, setSelectedImages] = useState<SelectedImageItem[]>([]);

  // PDF Compress / Extract state
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdfFile | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<'light' | 'balanced' | 'highly'>('balanced');
  const [extractFormat, setExtractFormat] = useState<'jpg' | 'png'>('jpg');

  // Process & Results state
  const [progress, setProgress] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<PdfProcessResult | null>(null);
  const [extractedImagesResult, setExtractedImagesResult] = useState<PdfToImagesResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const imagesInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleSubModeChange = (mode: PdfSubMode) => {
    haptics.selection();
    setSubMode(mode);
    setStage('idle');
    setSelectedImages([]);
    setSelectedPdf(null);
    setPdfResult(null);
    setExtractedImagesResult(null);
    setErrorMessage(null);
  };

  const handleTriggerPick = async () => {
    haptics.selection();
    if (subMode === 'images_to_pdf') {
      const picked = await engineManager.pickFiles('image/*', true);
      if (picked.length > 0) {
        const items = picked.map((p, i) => ({
          id: `img_${Date.now()}_${i}`,
          name: p.name,
          uri: p.uri,
          previewUrl: p.previewUrl,
        }));
        setSelectedImages(items);
        setStage('configuring');
        setErrorMessage(null);
        return;
      }
      imagesInputRef.current?.click();
    } else {
      const picked = await engineManager.pickFiles('application/pdf', false);
      if (picked.length > 0) {
        const p = picked[0];
        setSelectedPdf({
          name: p.name,
          sizeBytes: p.sizeBytes,
          uri: p.uri,
        });
        setStage('configuring');
        setErrorMessage(null);
        return;
      }
      pdfInputRef.current?.click();
    }
  };

  // Image files selected for Images to PDF
  const handleAddMoreImages = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('image/*', true);
    if (picked.length > 0) {
      const items = picked.map((p, i) => ({
        id: `img_${Date.now()}_${selectedImages.length + i}`,
        name: p.name,
        uri: p.uri,
        previewUrl: p.previewUrl,
      }));
      setSelectedImages((prev) => [...prev, ...items]);
      return;
    }
    imagesInputRef.current?.click();
  };

  const handleImagesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    haptics.mediumImpact();
    const loadedList: SelectedImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const item = await engineManager.cacheWebFile(files[i]);
      loadedList.push({
        id: `img_${Date.now()}_${i}`,
        name: item.name,
        uri: item.uri,
        previewUrl: item.previewUrl,
      });
    }

    setSelectedImages(loadedList);
    setStage('configuring');
    setErrorMessage(null);
  };

  // PDF file selected for Compress or PDF to Images
  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.mediumImpact();
    const item = await engineManager.cacheWebFile(file);
    setSelectedPdf({
      name: item.name,
      sizeBytes: item.sizeBytes,
      uri: item.uri,
    });
    setStage('configuring');
    setErrorMessage(null);
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
    haptics.mediumImpact();
    setStage('processing');
    setProgress(0);
    setErrorMessage(null);
    setSavedSuccess(false);

    try {
      if (subMode === 'images_to_pdf') {
        const paths = selectedImages.map((img) => img.uri);
        const res = await engineManager.imagesToPdf(paths, (p) => {
          setProgress(Math.round(p.progress * 100));
        });
        setPdfResult(res);
        setStage('done');
        haptics.success();
      } else if (subMode === 'compress_pdf') {
        if (!selectedPdf) return;
        const res = await engineManager.compressPdf(
          {
            inputPath: selectedPdf.uri,
            compressionLevel,
          },
          (p) => {
            setProgress(Math.round(p.progress * 100));
          }
        );
        setPdfResult(res);
        setStage('done');
        haptics.success();
      } else if (subMode === 'pdf_to_images') {
        if (!selectedPdf) return;
        const res = await engineManager.pdfToImages(
          selectedPdf.uri,
          extractFormat,
          (p) => {
            setProgress(Math.round(p.progress * 100));
          }
        );
        setExtractedImagesResult(res);
        setStage('done');
        haptics.success();
      }
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setStage('configuring');
      } else {
        setErrorMessage(humanizeError(err, "that PDF's being stubborn, try another document?"));
        setStage('configuring');
        haptics.error();
      }
    }
  };

  const handleCancel = async () => {
    if (activeJobId) {
      await engineManager.cancelJob(activeJobId);
      setActiveJobId(null);
      setStage('configuring');
    }
  };

  const handleSaveToGallery = async () => {
    try {
      if (pdfResult) {
        await engineManager.saveOutputToGallery(
          pdfResult.outputPath,
          'pdf',
          `squishh_${Date.now()}.pdf`
        );
        setSavedSuccess(true);
        haptics.success();
      } else if (extractedImagesResult) {
        for (let i = 0; i < extractedImagesResult.imagePaths.length; i++) {
          await engineManager.saveOutputToGallery(
            extractedImagesResult.imagePaths[i],
            'image',
            `squishh_page_${i + 1}_${Date.now()}.${extractFormat}`
          );
        }
        setSavedSuccess(true);
        haptics.success();
      }
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    }
  };

  const handleShare = async () => {
    try {
      const sharePaths = pdfResult
        ? [pdfResult.outputPath]
        : extractedImagesResult?.imagePaths || [];
      if (sharePaths.length === 0) return;

      haptics.selection();
      await engineManager.shareFiles(sharePaths, 'Squished PDF Document');
    } catch {
      // User dismissed share
    }
  };

  const resetAll = () => {
    haptics.selection();
    setStage('idle');
    setSelectedImages([]);
    setSelectedPdf(null);
    setPdfResult(null);
    setExtractedImagesResult(null);
    setProgress(0);
    setSavedSuccess(false);
    setErrorMessage(null);
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Hidden file inputs */}
      <input
        ref={imagesInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImagesSelected}
        className="hidden"
        id="pdf-images-input"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        onChange={handlePdfSelected}
        className="hidden"
        id="pdf-file-input"
      />

      {/* Sub-mode Segmented Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-[#EDE8E0] dark:bg-[#24282D] rounded-2xl text-xs font-semibold">
        <button
          onClick={() => handleSubModeChange('images_to_pdf')}
          className={`py-2 px-1 rounded-xl transition-all ${
            subMode === 'images_to_pdf'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          Photos &rarr; PDF
        </button>
        <button
          onClick={() => handleSubModeChange('compress_pdf')}
          className={`py-2 px-1 rounded-xl transition-all ${
            subMode === 'compress_pdf'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          Compress PDF
        </button>
        <button
          onClick={() => handleSubModeChange('pdf_to_images')}
          className={`py-2 px-1 rounded-xl transition-all ${
            subMode === 'pdf_to_images'
              ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-xs'
              : 'text-[#767B77] dark:text-[#949995]'
          }`}
        >
          PDF &rarr; Images
        </button>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-[#F6D6C6]/80 dark:bg-[#4A352D]/80 border border-[#EAC5B3] dark:border-[#5C4237] text-xs flex items-center gap-2 text-[#4A352D] dark:text-[#F6D6C6]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <div
          onClick={handleTriggerPick}
          className="p-8 rounded-3xl border-2 border-dashed border-[#DDD7CC] dark:border-[#383E46] bg-[#FBF9F5]/80 dark:bg-[#141618]/80 flex flex-col items-center text-center cursor-pointer transition-all hover:border-[#4A6B53] dark:hover:border-[#76A183] active:scale-[0.99]"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183] mb-3.5 shadow-sm">
            {subMode === 'images_to_pdf' ? (
              <Images className="w-7 h-7" />
            ) : (
              <FileText className="w-7 h-7" />
            )}
          </div>

          <p className="text-base font-bold mb-1">
            {subMode === 'images_to_pdf'
              ? 'pick photos to combine into PDF'
              : subMode === 'compress_pdf'
              ? 'pick PDF to compress'
              : 'pick PDF to extract page images'}
          </p>

          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            {subMode === 'images_to_pdf'
              ? 'select camera shots or receipts &bull; reorder pages freely'
              : 'shrink under portal limits (2 MB, 1 MB) &bull; 100% offline'}
          </p>

          <SquishhButton
            size="md"
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleTriggerPick();
            }}
          >
            {subMode === 'images_to_pdf' ? 'select photos' : 'select PDF file'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && (
        <div className="flex flex-col gap-4">
          {/* Sub-mode 1: Images to PDF page reorder card */}
          {subMode === 'images_to_pdf' && selectedImages.length > 0 && (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#767B77] dark:text-[#949995]">
                  {selectedImages.length} pages &bull; tap arrows to reorder
                </span>
                <button
                  onClick={handleAddMoreImages}
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline"
                >
                  add more
                </button>
              </div>

              {/* Reorderable page list */}
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {selectedImages.map((img, idx) => (
                  <div
                    key={img.id}
                    className="flex items-center gap-3 p-2 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]"
                  >
                    <span className="w-6 text-center font-mono font-bold text-xs text-[#767B77]">
                      #{idx + 1}
                    </span>
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="w-10 h-10 rounded-xl object-cover border border-[#E5DFD5] dark:border-[#2D3238]"
                    />
                    <span className="flex-1 min-w-0 text-xs font-semibold truncate">
                      {img.name}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveImage(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded-lg hover:bg-[#EDE8E0] dark:hover:bg-[#24282D] disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveImage(idx, 'down')}
                        disabled={idx === selectedImages.length - 1}
                        className="p-1 rounded-lg hover:bg-[#EDE8E0] dark:hover:bg-[#24282D] disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeImage(idx)}
                        className="p-1 rounded-lg hover:bg-[#F6D6C6] dark:hover:bg-[#4A352D] text-[#4A352D] dark:text-[#F6D6C6]"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-mode 2: Compress PDF options */}
          {subMode === 'compress_pdf' && selectedPdf && (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <FileText className="w-6 h-6 text-[#4A6B53] dark:text-[#76A183]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedPdf.name}</p>
                  <p className="text-xs text-[#767B77] dark:text-[#949995]">
                    original: {formatBytes(selectedPdf.sizeBytes)}
                  </p>
                </div>
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline"
                >
                  change
                </button>
              </div>

              {/* 3 Compression Options */}
              <label className="text-xs font-semibold text-[#767B77] dark:text-[#949995] block">
                compression level
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  {
                    id: 'light' as const,
                    label: 'Light',
                    reduction: '~20%',
                    desc: 'Crisp text',
                  },
                  {
                    id: 'balanced' as const,
                    label: 'Balanced',
                    reduction: '~45-50%',
                    desc: 'Optimal',
                  },
                  {
                    id: 'highly' as const,
                    label: 'Highly',
                    reduction: '~80-90%',
                    desc: 'Ultra small',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCompressionLevel(item.id);
                      haptics.selection();
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
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
                <FileText className="w-6 h-6 text-[#4A6B53] dark:text-[#76A183]" />
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
                      onClick={() => {
                        setExtractFormat(fmt);
                        haptics.selection();
                      }}
                      className={`py-1 px-3 rounded-lg text-xs font-bold uppercase transition-all ${
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
        <div className="p-8 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183] mb-4 animate-pulse shadow-sm">
            <FileText className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold mb-1">
            {subMode === 'images_to_pdf'
              ? 'rendering PDF pages…'
              : subMode === 'compress_pdf'
              ? 'squishing PDF document…'
              : 'extracting high-res images…'}
          </h3>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            native Android PdfRenderer &bull; 100% offline
          </p>

          <div className="w-full bg-[#E5DFD5] dark:bg-[#2D3238] h-3 rounded-full overflow-hidden mb-3">
            <div
              className="bg-[#4A6B53] dark:bg-[#76A183] h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-xs font-semibold mb-6">{progress}% complete</span>

          <SquishhButton size="sm" variant="secondary" onClick={handleCancel}>
            cancel
          </SquishhButton>
        </div>
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && (pdfResult || extractedImagesResult) && (
        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold mb-1">all done ✨</h3>
            <p className="text-xs text-[#767B77] dark:text-[#949995] mb-4">
              {subMode === 'images_to_pdf'
                ? `compiled ${pdfResult?.pageCount} pages into PDF`
                : subMode === 'compress_pdf'
                ? 'PDF successfully squished'
                : `extracted ${extractedImagesResult?.pageCount} page images`}
            </p>

            {/* Savings Pill if compressed */}
            {pdfResult && pdfResult.originalSizeBytes > pdfResult.compressedSizeBytes && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4] text-xs font-semibold mb-5">
                <span>
                  Saved{' '}
                  {Math.round(
                    ((pdfResult.originalSizeBytes - pdfResult.compressedSizeBytes) /
                      pdfResult.originalSizeBytes) *
                      100
                  )}
                  %
                </span>
                <span>&bull;</span>
                <span>
                  {formatBytes(pdfResult.originalSizeBytes)} &rarr; {formatBytes(pdfResult.compressedSizeBytes)}
                </span>
              </div>
            )}

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

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full">
              <SquishhButton
                size="md"
                variant="primary"
                onClick={handleSaveToGallery}
                icon={<Download className="w-4 h-4" />}
                className="w-full"
              >
                {savedSuccess
                  ? 'saved to downloads ✓'
                  : subMode === 'pdf_to_images'
                  ? 'save all images to gallery'
                  : 'save PDF to downloads'}
              </SquishhButton>

              <SquishhButton
                size="md"
                variant="secondary"
                onClick={handleShare}
                icon={<Share2 className="w-4 h-4" />}
                className="w-full"
              >
                {subMode === 'pdf_to_images' ? 'share images' : 'share PDF document'}
              </SquishhButton>

              <button
                onClick={resetAll}
                className="mt-2 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>squish another document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
