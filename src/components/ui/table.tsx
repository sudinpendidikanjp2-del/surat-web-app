import * as React from 'react';
import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  );
}
const TableHeader = (p: React.ComponentProps<'thead'>) => <thead {...p} className={cn('bg-muted/60 [&_tr]:border-b [&_tr]:border-border', p.className)} />;
const TableBody = (p: React.ComponentProps<'tbody'>) => <tbody {...p} className={cn('[&_tr:last-child]:border-0', p.className)} />;
const TableRow = (p: React.ComponentProps<'tr'>) => <tr {...p} className={cn('border-b border-line transition-colors duration-100 data-[state=selected]:bg-primary-soft', p.className)} />;
const TableHead = (p: React.ComponentProps<'th'>) => <th {...p} className={cn('h-10 px-3 text-left align-middle font-semibold whitespace-nowrap text-muted-foreground', p.className)} />;
const TableCell = (p: React.ComponentProps<'td'>) => <td {...p} className={cn('px-3 py-2.5 align-middle', p.className)} />;

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
