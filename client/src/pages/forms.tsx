import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ClipboardList,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Code2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  Inbox,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  GripVertical,
} from "lucide-react";
import type { Form, FormSubmission } from "@shared/schema";

type FieldType = "text" | "email" | "phone" | "number" | "textarea" | "select" | "checkbox";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

type FormWithCount = Form & { submissionCount: number };

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short Text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  textarea: "Long Text",
  select: "Dropdown",
  checkbox: "Checkbox",
};

function generateFieldId() {
  return "f_" + Math.random().toString(36).slice(2, 8);
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function generateEmbedCode(formId: number, origin: string) {
  return `<!-- Afro AI Form Embed -->
<div id="afroai-form-${formId}"></div>
<script>
(function() {
  var formId = ${formId};
  var endpoint = "${origin}/api/forms/" + formId + "/submit";
  fetch("${origin}/api/forms/" + formId)
    .then(r => r.json())
    .then(function(form) {
      var container = document.getElementById("afroai-form-" + formId);
      if (!container || !form.fields) return;
      var html = '<form id="af-form-' + formId + '" style="font-family:sans-serif;max-width:480px;">';
      form.fields.forEach(function(f) {
        html += '<div style="margin-bottom:16px;">';
        html += '<label style="display:block;margin-bottom:6px;font-weight:500;">' + f.label + (f.required ? ' <span style="color:#ef4444">*</span>' : '') + '</label>';
        if (f.type === "textarea") {
          html += '<textarea name="' + f.id + '" placeholder="' + (f.placeholder||'') + '" ' + (f.required?'required':'') + ' style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:6px;resize:vertical;min-height:80px;"></textarea>';
        } else if (f.type === "select" && f.options) {
          html += '<select name="' + f.id + '" ' + (f.required?'required':'') + ' style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:6px;">';
          html += '<option value="">Select...</option>';
          f.options.forEach(function(o) { html += '<option value="' + o + '">' + o + '</option>'; });
          html += '</select>';
        } else if (f.type === "checkbox") {
          html += '<input type="checkbox" name="' + f.id + '" id="cb-' + f.id + '" style="margin-right:8px;">';
          html += '<label for="cb-' + f.id + '">' + f.label + '</label>';
        } else {
          html += '<input type="' + f.type + '" name="' + f.id + '" placeholder="' + (f.placeholder||'') + '" ' + (f.required?'required':'') + ' style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:6px;">';
        }
        html += '</div>';
      });
      html += '<button type="submit" style="background:#d4af37;color:#000;padding:10px 24px;border:none;border-radius:6px;font-weight:600;cursor:pointer;">' + (form.submitButtonText || 'Submit') + '</button>';
      html += '<div id="af-msg-' + formId + '" style="margin-top:12px;"></div>';
      html += '</form>';
      container.innerHTML = html;
      document.getElementById("af-form-" + formId).addEventListener("submit", function(e) {
        e.preventDefault();
        var data = {};
        new FormData(e.target).forEach(function(v, k) { data[k] = v; });
        fetch(endpoint, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data) })
          .then(r => r.json())
          .then(function(res) {
            document.getElementById("af-msg-" + formId).innerHTML = '<p style="color:green;">' + (res.message || "Thank you!") + '</p>';
            e.target.reset();
          })
          .catch(function() {
            document.getElementById("af-msg-" + formId).innerHTML = '<p style="color:red;">Something went wrong. Please try again.</p>';
          });
      });
    });
})();
</script>`;
}

function FieldEditor({ field, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  field: FormField;
  onUpdate: (f: FormField) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [optionInput, setOptionInput] = useState("");

  return (
    <div className="border border-border/60 rounded-lg p-4 bg-muted/20 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <Input
            value={field.label}
            onChange={(e) => onUpdate({ ...field, label: e.target.value })}
            placeholder="Field label"
            className="h-8 text-sm"
            data-testid={`input-field-label-${field.id}`}
          />
          <Select value={field.type} onValueChange={(v) => onUpdate({ ...field, type: v as FieldType, options: v === "select" ? (field.options || []) : undefined })}>
            <SelectTrigger className="h-8 text-sm" data-testid={`select-field-type-${field.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onMoveUp} disabled={isFirst}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onMoveDown} disabled={isLast}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} data-testid={`button-delete-field-${field.id}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {field.type !== "checkbox" && field.type !== "select" && (
        <Input
          value={field.placeholder || ""}
          onChange={(e) => onUpdate({ ...field, placeholder: e.target.value })}
          placeholder="Placeholder text (optional)"
          className="h-8 text-sm"
        />
      )}

      {field.type === "select" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {(field.options || []).map((opt, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs">
                {opt}
                <button onClick={() => onUpdate({ ...field, options: field.options?.filter((_, idx) => idx !== i) })} className="ml-1 hover:text-destructive">×</button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && optionInput.trim()) {
                  onUpdate({ ...field, options: [...(field.options || []), optionInput.trim()] });
                  setOptionInput("");
                }
              }}
              placeholder="Add option (press Enter)"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={() => {
              if (optionInput.trim()) {
                onUpdate({ ...field, options: [...(field.options || []), optionInput.trim()] });
                setOptionInput("");
              }
            }}>Add</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch
          id={`req-${field.id}`}
          checked={field.required}
          onCheckedChange={(v) => onUpdate({ ...field, required: v })}
          data-testid={`switch-required-${field.id}`}
        />
        <Label htmlFor={`req-${field.id}`} className="text-xs text-muted-foreground">Required</Label>
      </div>
    </div>
  );
}

function FormBuilderDialog({ form, onClose }: { form?: FormWithCount; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(form?.name || "");
  const [description, setDescription] = useState(form?.description || "");
  const [fields, setFields] = useState<FormField[]>((form?.fields as FormField[]) || []);
  const [submitButtonText, setSubmitButtonText] = useState(form?.submitButtonText || "Submit");
  const [successMessage, setSuccessMessage] = useState(form?.successMessage || "Thank you! Your submission has been received.");
  const [notificationEmail, setNotificationEmail] = useState(form?.notificationEmail || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description, fields, submitButtonText, successMessage, notificationEmail: notificationEmail || null };
      if (form) return await apiRequest("PUT", `/api/forms/${form.id}`, payload);
      return await apiRequest("POST", "/api/forms", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: form ? "Form updated" : "Form created", description: form ? "Your changes have been saved." : "Your new form is ready to use." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save form", variant: "destructive" });
    },
  });

  const addField = (type: FieldType) => {
    setFields([...fields, { id: generateFieldId(), type, label: FIELD_TYPE_LABELS[type], placeholder: "", required: false }]);
  };

  const updateField = (idx: number, updated: FormField) => {
    const newFields = [...fields];
    newFields[idx] = updated;
    setFields(newFields);
  };

  const deleteField = (idx: number) => setFields(fields.filter((_, i) => i !== idx));

  const moveField = (idx: number, dir: -1 | 1) => {
    const newFields = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= newFields.length) return;
    [newFields[idx], newFields[target]] = [newFields[target], newFields[idx]];
    setFields(newFields);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-primary" />
            {form ? "Edit Form" : "Create New Form"}
          </DialogTitle>
          <DialogDescription>
            {form ? "Update your form fields and settings." : "Build a form with custom fields to collect data from visitors."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="fields" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="fields" className="flex-1" data-testid="tab-fields">Fields</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Form Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contact Form" data-testid="input-form-name" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this form" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fields ({fields.length})</Label>
                <div className="flex gap-1 flex-wrap justify-end">
                  {(["text", "email", "phone", "textarea", "select", "checkbox"] as FieldType[]).map((type) => (
                    <Button key={type} size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => addField(type)} data-testid={`button-add-${type}`}>
                      <Plus className="w-3 h-3 mr-1" />{FIELD_TYPE_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center text-muted-foreground text-sm">
                  Add fields above to start building your form
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <FieldEditor
                      key={f.id}
                      field={f}
                      onUpdate={(updated) => updateField(idx, updated)}
                      onDelete={() => deleteField(idx)}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, 1)}
                      isFirst={idx === 0}
                      isLast={idx === fields.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Submit Button Text</Label>
              <Input value={submitButtonText} onChange={(e) => setSubmitButtonText(e.target.value)} placeholder="Submit" />
            </div>
            <div className="space-y-2">
              <Label>Success Message</Label>
              <Textarea value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} placeholder="Thank you! Your submission has been received." rows={3} />
              <p className="text-xs text-muted-foreground">Shown to the user after successful submission.</p>
            </div>
            <div className="space-y-2">
              <Label>Notification Email (optional)</Label>
              <Input type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} placeholder="you@example.com" />
              <p className="text-xs text-muted-foreground">Get notified by email when someone submits this form. (Coming soon)</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} data-testid="button-save-form">
            {saveMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving...</> : form ? "Save Changes" : "Create Form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionsDialog({ form, onClose }: { form: FormWithCount; onClose: () => void }) {
  const { toast } = useToast();
  const fields = (form.fields as FormField[]) || [];

  const { data: submissions, isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["/api/forms", form.id, "submissions"],
    queryFn: async () => {
      const res = await fetch(`/api/forms/${form.id}/submissions`, { credentials: "include" });
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (subId: number) => {
      await apiRequest("DELETE", `/api/forms/${form.id}/submissions/${subId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", form.id, "submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Submission deleted" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Submissions — {form.name}
          </DialogTitle>
          <DialogDescription>
            {form.submissionCount} submission{form.submissionCount !== 1 ? "s" : ""} received
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : !submissions || submissions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No submissions yet</p>
            <p className="text-xs mt-1">Embed this form on your website to start collecting responses.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {submissions.map((sub) => {
              const data = sub.data as Record<string, string>;
              return (
                <div key={sub.id} className="border border-border/60 rounded-lg p-4 space-y-2" data-testid={`submission-${sub.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatDate(sub.createdAt)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(sub.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fields.map((f) => (
                      <div key={f.id} className="space-y-0.5">
                        <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                        <p className="text-sm break-words">{data[f.id] || <span className="text-muted-foreground italic">—</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmbedDialog({ form, onClose }: { form: FormWithCount; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const embedCode = generateEmbedCode(form.id, window.location.origin);

  const copy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            Embed Code — {form.name}
          </DialogTitle>
          <DialogDescription>
            Copy and paste this code into any HTML page to display your form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="bg-muted rounded-lg p-4 border">
            <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
              {embedCode}
            </pre>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-primary">How to use</p>
            <p className="text-xs text-muted-foreground">1. Copy the code above</p>
            <p className="text-xs text-muted-foreground">2. Paste it inside the <code className="bg-muted px-1 rounded">&lt;body&gt;</code> of your HTML page</p>
            <p className="text-xs text-muted-foreground">3. The form will automatically load and submissions will appear here in Afro AI</p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={copy} data-testid="button-copy-embed">
            {copied ? <><Check className="w-4 h-4 mr-2 text-green-500" />Copied!</> : <><Copy className="w-4 h-4 mr-2" />Copy Code</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FormsPage() {
  const { toast } = useToast();
  const [builderForm, setBuilderForm] = useState<FormWithCount | "new" | null>(null);
  const [submissionsForm, setSubmissionsForm] = useState<FormWithCount | null>(null);
  const [embedForm, setEmbedForm] = useState<FormWithCount | null>(null);
  const [deleteForm, setDeleteForm] = useState<FormWithCount | null>(null);

  const { data: forms, isLoading } = useQuery<FormWithCount[]>({
    queryKey: ["/api/forms"],
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return await apiRequest("PUT", `/api/forms/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forms"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      setDeleteForm(null);
      toast({ title: "Form deleted", description: "The form and all its submissions have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete form", variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-forms-title">Form Builder</h1>
              <p className="text-sm text-muted-foreground">Create forms and collect submissions from your visitors</p>
            </div>
          </div>
          <Button onClick={() => setBuilderForm("new")} data-testid="button-create-form">
            <Plus className="w-4 h-4 mr-2" />
            New Form
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-72" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : forms && forms.length > 0 ? (
          <div className="space-y-4">
            {forms.map((form) => {
              const fieldCount = (form.fields as FormField[])?.length || 0;
              return (
                <Card key={form.id} data-testid={`card-form-${form.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${form.isActive ? "bg-green-500/10" : "bg-muted"}`}>
                          <ClipboardList className={`w-5 h-5 ${form.isActive ? "text-green-500" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate" data-testid={`text-form-name-${form.id}`}>{form.name}</h3>
                            <Badge variant={form.isActive ? "default" : "secondary"} className="text-xs">
                              {form.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          {form.description && <p className="text-sm text-muted-foreground truncate">{form.description}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">{fieldCount} field{fieldCount !== 1 ? "s" : ""}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs font-medium text-primary" data-testid={`text-submission-count-${form.id}`}>
                              {form.submissionCount} submission{form.submissionCount !== 1 ? "s" : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{formatDate(form.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                        <Button size="sm" variant="outline" onClick={() => setSubmissionsForm(form)} data-testid={`button-view-submissions-${form.id}`}>
                          <Inbox className="w-3.5 h-3.5 mr-1" />
                          <span className="hidden sm:inline">Submissions</span>
                          {form.submissionCount > 0 && (
                            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{form.submissionCount}</Badge>
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEmbedForm(form)} data-testid={`button-embed-${form.id}`}>
                          <Code2 className="w-3.5 h-3.5 mr-1" />
                          <span className="hidden sm:inline">Embed</span>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setBuilderForm(form)} data-testid={`button-edit-form-${form.id}`}>
                          <Edit3 className="w-3.5 h-3.5 mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => toggleActiveMutation.mutate({ id: form.id, isActive: !form.isActive })}
                          title={form.isActive ? "Deactivate" : "Activate"}
                          data-testid={`button-toggle-form-${form.id}`}
                        >
                          {form.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteForm(form)} data-testid={`button-delete-form-${form.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <ClipboardList className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No Forms Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Create your first form to collect contact requests, bookings, survey responses, and more from your website visitors.
              </p>
              <Button onClick={() => setBuilderForm("new")} data-testid="button-create-first-form">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Form
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {builderForm !== null && (
        <FormBuilderDialog
          form={builderForm === "new" ? undefined : builderForm}
          onClose={() => setBuilderForm(null)}
        />
      )}

      {submissionsForm && (
        <SubmissionsDialog form={submissionsForm} onClose={() => setSubmissionsForm(null)} />
      )}

      {embedForm && (
        <EmbedDialog form={embedForm} onClose={() => setEmbedForm(null)} />
      )}

      <Dialog open={!!deleteForm} onOpenChange={() => setDeleteForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Form
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteForm?.name}</strong>? This will permanently delete the form and all <strong>{deleteForm?.submissionCount} submission{deleteForm?.submissionCount !== 1 ? "s" : ""}</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteForm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteForm && deleteMutation.mutate(deleteForm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-form"
            >
              {deleteMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Deleting...</> : <><Trash2 className="w-4 h-4 mr-2" />Delete Form</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
