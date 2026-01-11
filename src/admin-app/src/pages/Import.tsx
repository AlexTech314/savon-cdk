import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importBusinesses } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, FileText, Check, X, Loader2, Columns } from 'lucide-react';
import { ExportWizard } from '@/components/ExportWizard';

const Import: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showExportWizard, setShowExportWizard] = useState(false);

  const importMutation = useMutation({
    mutationFn: (csvData: string) => importBusinesses(csvData),
    onSuccess: (result) => {
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${result.imported} businesses.`,
      });
      setFile(null);
      setPreview([]);
      setImportProgress(0);
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: () => {
      toast({
        title: 'Import Failed',
        description: 'There was an error importing the CSV file.',
        variant: 'destructive',
      });
      setImportProgress(0);
    },
  });

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cells.push(current.trim());
      return cells;
    });
  };

  const handleFile = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please select a CSV file.',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setPreview(parsed.slice(0, 11)); // Header + 10 rows
    };
    reader.readAsText(selectedFile);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImport = () => {
    if (!file) return;
    
    setImportProgress(10);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportProgress(50);
      const text = e.target?.result as string;
      importMutation.mutate(text);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = 'name,business_type,address,city,state,phone,website\n"Example Plumber","Plumber","123 Main St","Los Angeles","CA","(555) 123-4567","https://example.com"';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'business_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import / Export</h1>
        <p className="text-muted-foreground">
          Import businesses from CSV or export your data
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Import section */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Import CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file to import businesses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative rounded-lg border-2 border-dashed p-8 text-center transition-colors
                ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
              `}
            >
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium">
                Drag and drop your CSV file here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to browse
              </p>
            </div>

            {/* Template download */}
            <Button variant="link" onClick={downloadTemplate} className="p-0 h-auto">
              <FileText className="mr-2 h-4 w-4" />
              Download CSV template
            </Button>

            {/* File preview */}
            {file && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setFile(null); setPreview([]); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Preview table */}
                {preview.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {preview[0]?.map((header, i) => (
                            <th key={i} className="px-3 py-2 text-left font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(1, 6).map((row, i) => (
                          <tr key={i} className="border-t border-border">
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-2 text-muted-foreground">
                                {cell.substring(0, 30)}{cell.length > 30 ? '...' : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.length > 6 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        ...and {preview.length - 6} more rows
                      </p>
                    )}
                  </div>
                )}

                {/* Progress */}
                {importMutation.isPending && (
                  <div className="space-y-2">
                    <Progress value={importProgress} />
                    <p className="text-sm text-muted-foreground">Importing...</p>
                  </div>
                )}

                {/* Import button */}
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                  className="w-full gap-2"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Import {preview.length - 1} Businesses
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export section */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Export CSV
            </CardTitle>
            <CardDescription>
              Download your business data as a CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-6 text-center">
              <Columns className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium">
                Choose Your Columns
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Select specific columns to include in your export, or export all data
              </p>
            </div>

            <div className="space-y-2">
              <Button onClick={() => setShowExportWizard(true)} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Export Businesses...
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Opens a wizard to select columns for export
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Wizard Modal */}
      <ExportWizard 
        open={showExportWizard} 
        onClose={() => setShowExportWizard(false)} 
      />
    </div>
  );
};

export default Import;
