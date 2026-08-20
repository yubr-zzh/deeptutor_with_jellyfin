# -*- coding: utf-8 -*-
"""PIL draw DeepTutor architecture diagram."""
import sys
sys.path.insert(0, r"D:\Users\zzh\Desktop\DeepTutor项目\deep-tutor-plus\.venv\Lib\site-packages")

from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1400, 1000
img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)

FP = "C:/Windows/Fonts/msyh.ttc"
FB = "C:/Windows/Fonts/msyhbd.ttc"

def font(size, bold=False):
    return ImageFont.truetype(FB if bold else FP, size)

C_BORDER = "#94a3b8"
C_FRONT = "#0ea5e9"
C_BACK = "#10b981"
C_JF = "#f59e0b"
C_DB = "#8b5cf6"
C_TEXT = "#1e293b"
C_SUB = "#64748b"

def box(x, y, w, h, title, sub, color):
    d.rounded_rectangle([x, y, x+w, y+h], radius=10, fill="#f8fafc", outline=color, width=2)
    d.rectangle([x, y+8, x+5, y+h-8], fill=color)
    ts = 20
    tw = d.textlength(title, font=font(ts, True))
    d.text((x + (w-tw)/2, y + 14), title, font=font(ts, True), fill=C_TEXT)
    if sub:
        ss = 14
        sw = d.textlength(sub, font=font(ss))
        d.text((x + (w-sw)/2, y + 14 + ts + 8), sub, font=font(ss), fill=C_SUB)

def arrow(x1, y1, x2, y2, color="#64748b", width=2, label=None):
    d.line([x1, y1, x2, y2], fill=color, width=width)
    ang = math.atan2(y2-y1, x2-x1)
    L = 12
    p1 = (x2 - L*math.cos(ang-0.4), y2 - L*math.sin(ang-0.4))
    p2 = (x2 - L*math.cos(ang+0.4), y2 - L*math.sin(ang+0.4))
    d.line([(x2, y2), p1], fill=color, width=width)
    d.line([(x2, y2), p2], fill=color, width=width)
    if label:
        lf = font(12)
        lx = (x1+x2)/2 - d.textlength(label, font=lf)/2
        ly = (y1+y2)/2 - 6
        d.rounded_rectangle([lx-6, ly-2, lx+d.textlength(label, font=lf)+6, ly+16], radius=4, fill="#ffffff", outline=color)
        d.text((lx, ly), label, font=lf, fill=color)

# Title
tw = d.textlength("DeepTutor 课程点播系统架构", font=font(30, True))
d.text(((W-tw)/2, 30), "DeepTutor 课程点播系统架构", font=font(30, True), fill=C_TEXT)
tw2 = d.textlength("前端 · 后端 · Jellyfin 媒体引擎 · 存储", font=font(14))
d.text(((W-tw2)/2, 80), "前端 · 后端 · Jellyfin 媒体引擎 · 存储", font=font(14), fill=C_SUB)

# Layer 1: Frontend
box(100, 140, 560, 110, "Web 前端 (Next.js)", "课程列表 / 播放器 / 管理后台 / 登录注册", C_FRONT)

# Layer 2: Backend
box(100, 380, 560, 200, "DeepTutor 后端 (FastAPI)", "", C_BACK)
d.rounded_rectangle([130, 445, 290, 540], radius=8, fill="#ecfdf5", outline="#34d399", width=1)
d.text((145, 460), "认证", font=font(16, True), fill=C_TEXT)
d.text((145, 492), "JWT + 角色", font=font(12), fill=C_SUB)
d.rounded_rectangle([310, 445, 470, 540], radius=8, fill="#ecfdf5", outline="#34d399", width=1)
d.text((325, 460), "课程管理", font=font(16, True), fill=C_TEXT)
d.text((325, 492), "增删查改", font=font(12), fill=C_SUB)
d.rounded_rectangle([490, 445, 630, 540], radius=8, fill="#ecfdf5", outline="#34d399", width=1)
d.text((505, 460), "流代理", font=font(16, True), fill=C_TEXT)
d.text((505, 492), "隐藏 API Key", font=font(12), fill=C_SUB)

# Layer 3: Jellyfin
box(100, 700, 560, 110, "Jellyfin 媒体服务器", "视频入库 / 转码 (ffmpeg) / 播放引擎", C_JF)

# Right: Storage
box(820, 380, 480, 430, "存储层", "", C_DB)
d.rounded_rectangle([850, 450, 1220, 540], radius=8, fill="#f5f3ff", outline="#a78bfa", width=1)
d.text((875, 465), "SQLite", font=font(16, True), fill=C_TEXT)
d.text((875, 497), "课程 / 视频 / 进度表", font=font(12), fill=C_SUB)
d.rounded_rectangle([850, 570, 1220, 660], radius=8, fill="#f5f3ff", outline="#a78bfa", width=1)
d.text((875, 585), "视频文件 (D:/Media/Courses/)", font=font(16, True), fill=C_TEXT)
d.text((875, 617), "SxxExx 剧集命名 · 支持多格式", font=font(12), fill=C_SUB)
d.rounded_rectangle([850, 690, 1220, 780], radius=8, fill="#f5f3ff", outline="#a78bfa", width=1)
d.text((875, 705), "用户进度 (video_progress)", font=font(16, True), fill=C_TEXT)
d.text((875, 737), "按用户隔离 · 跨设备同步", font=font(12), fill=C_SUB)

# Arrows
arrow(380, 250, 380, 380, label="REST API")
arrow(380, 580, 380, 700, label="媒体索引 / 流请求")
arrow(660, 755, 820, 755, label="读取视频")
arrow(660, 500, 820, 500, label="元数据 / 进度")
arrow(660, 640, 820, 740, color="#94a3b8", width=1)

# Legend
ly = 880
d.text((100, ly), "图例：", font=font(16, True), fill=C_TEXT)
d.rounded_rectangle([190, ly-4, 280, ly+24], radius=6, fill="#f8fafc", outline=C_FRONT, width=2)
d.text((210, ly), "前端", font=font(14), fill=C_TEXT)
d.rounded_rectangle([300, ly-4, 400, ly+24], radius=6, fill="#f8fafc", outline=C_BACK, width=2)
d.text((320, ly), "后端", font=font(14), fill=C_TEXT)
d.rounded_rectangle([410, ly-4, 520, ly+24], radius=6, fill="#f8fafc", outline=C_JF, width=2)
d.text((430, ly), "媒体引擎", font=font(14), fill=C_TEXT)
d.rounded_rectangle([540, ly-4, 630, ly+24], radius=6, fill="#f8fafc", outline=C_DB, width=2)
d.text((560, ly), "存储", font=font(14), fill=C_TEXT)
d.text((680, ly), "箭头 = 数据流 / 调用关系", font=font(14), fill=C_SUB)

out = r"D:\Users\zzh\Desktop\DeepTutor项目\架构图_精确版.png"
img.save(out)
print("generated:", out)
