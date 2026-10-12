import * as React from 'react';
import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom border-collapse text-base', className)} {...props} />
    </div>
  );
}
const TableHeader = (p: React.ComponentProps<'thead'>) => <thead {...p} className={cn('[&_tr]:border-b-2 [&_tr]:border-[#d6d1c4]', p.className)} />;
const TableBody = (p: React.ComponentProps<'tbody'>) => <tbody {...p} className={cn('[&_tr:last-child]:border-0', p.className)} />;
const TableRow = (p: React.ComponentProps<'tr'>) => <tr {...p} className={cn('border-b border-[#e4e0d6]', p.className)} />;
const TableHead = (p: React.ComponentProps<'th'>) => <th {...p} className={cn('px-4 py-3 text-left font-bold whitespace-nowrap', p.className)} />;
const TableCell = (p: React.ComponentProps<'td'>) => <td {...p} className={cn('px-4 py-3 align-top', p.className)} />;

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
