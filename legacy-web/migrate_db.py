#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
資料庫遷移腳本 - 添加GPS位置欄位
"""

import sqlite3
import os

def migrate_database():
    """遷移資料庫，添加GPS位置欄位"""
    
    db_path = 'employee_management.db'
    
    if not os.path.exists(db_path):
        print("資料庫檔案不存在，無需遷移")
        return
    
    print("開始遷移資料庫...")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 檢查是否已經有GPS欄位
        cursor.execute("PRAGMA table_info(attendance_record)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # 需要添加的欄位
        new_columns = [
            ('clock_in_latitude', 'REAL'),
            ('clock_in_longitude', 'REAL'),
            ('clock_in_address', 'TEXT'),
            ('clock_out_latitude', 'REAL'),
            ('clock_out_longitude', 'REAL'),
            ('clock_out_address', 'TEXT')
        ]
        
        # 添加新欄位
        for column_name, column_type in new_columns:
            if column_name not in columns:
                print(f"添加欄位: {column_name}")
                cursor.execute(f"ALTER TABLE attendance_record ADD COLUMN {column_name} {column_type}")
            else:
                print(f"欄位已存在: {column_name}")
        
        conn.commit()
        print("資料庫遷移完成！")
        
    except Exception as e:
        print(f"遷移失敗: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    migrate_database()
