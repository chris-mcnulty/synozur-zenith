import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Folder, Upload, Search, MoreVertical, Share2, History, Trash2, File as FileIcon, FileSpreadsheet, FileIcon as FileImage } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const documents = [
  { id: "1", name: "Q1 Financial Report.xlsx", type: "excel", size: "2.4 MB", modified: "2 hours ago", modifiedBy: "Sarah Jenkins", status: "Published" },
  { id: "2", name: "Project Phoenix Architecture.pdf", type: "pdf", size: "14.1 MB", modified: "Yesterday", modifiedBy: "Mike Chen", status: "Draft" },
  { id: "3", name: "Q2 Marketing Assets", type: "folder", size: "--", modified: "3 days ago", modifiedBy: "Alex Wong", status: "--" },
  { id: "4", name: "Employee Handbook 2026.docx", type: "word", size: "4.8 MB", modified: "1 week ago", modifiedBy: "HR Dept", status: "Published" },
  { id: "5", name: "Client Presentation Template.pptx", type: "powerpoint", size: "8.2 MB", modified: "2 weeks ago", modifiedBy: "Sarah Jenkins", status: "Review" },
];

export default function DocumentLibraryPage() {
  const getIcon = (type: string) => {
    switch(type) {
      case 'excel': return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
      case 'word': return <FileText className="w-5 h-5 text-blue-600" />;
      case 'powerpoint': return <FileIcon className="w-5 h-5 text-orange-500" />;
      case 'pdf': return <FileIcon className="w-5 h-5 text-red-500" />;
      case 'folder': return <Folder className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Library</h1>
          <p className="text-muted-foreground mt-1">Manage corporate documents, metadata, and versioning.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
          <Button className="gap-2">
            <Folder className="w-4 h-4" />
            New Folder
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl">Corporate Assets</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[40%] pl-6">Name</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead>Modified By</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      {getIcon(doc.type)}
                      <span className="font-medium hover:underline cursor-pointer">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.modified}</TableCell>
                  <TableCell>{doc.modifiedBy}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.size}</TableCell>
                  <TableCell>
                    {doc.status !== '--' && (
                      <Badge variant="outline" className={
                        doc.status === 'Published' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        doc.status === 'Draft' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                        'bg-blue-500/10 text-blue-500 border-blue-500/20'
                      }>
                        {doc.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2"><Share2 className="w-4 h-4" /> Share</DropdownMenuItem>
                        <DropdownMenuItem className="gap-2"><History className="w-4 h-4" /> Version History</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive"><Trash2 className="w-4 h-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
