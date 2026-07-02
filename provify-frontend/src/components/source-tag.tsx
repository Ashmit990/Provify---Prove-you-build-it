import { FileCode2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function SourceTag({ file }: { file: string }) {
  return (
    <Badge variant="source">
      <FileCode2 className="size-3.5" />
      {file}
    </Badge>
  );
}
