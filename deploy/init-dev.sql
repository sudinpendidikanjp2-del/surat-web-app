-- Hanya untuk lingkungan lokal. Uji membuat dan menghapus database sendiri, jadi akun perlu hak CREATEDB.
ALTER ROLE surat CREATEDB;
CREATE DATABASE surat_test OWNER surat;
