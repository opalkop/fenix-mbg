(function (global) {
  "use strict";

  var namespace = global.FenixAPlus || {};
  var SIZES = {
    "standard-970x300": { width: 970, height: 300, label: "Standard 970 x 300" },
    "hi-res-1940x600": { width: 1940, height: 600, label: "Hi-res 1940 x 600" }
  };

  function sizeFor(value) {
    return SIZES[value] || SIZES["hi-res-1940x600"];
  }

  function colorFor(project, preset) {
    var colors = project.brandColors || {};
    if (preset === "secondary") {
      return colors.secondary || "#e9ad42";
    }
    if (preset === "fenix-dark") {
      return "#101821";
    }
    if (preset === "auto") {
      return "#f4f1ea";
    }
    return colors.primary || "#f47b20";
  }

  function hexToRgb(hex) {
    var raw = String(hex || "#111827").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      raw = "111827";
    }
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16)
    };
  }

  function readableTextColor(background) {
    var rgb = hexToRgb(background);
    var luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.58 ? "#17202b" : "#fff7ed";
  }

  function setTextFont(ctx, weight, size) {
    ctx.font = weight + " " + Math.round(size) + "px Arial, Helvetica, sans-serif";
  }

  function loadImage(record) {
    return new Promise(function (resolve, reject) {
      var image;
      if (!record || !record.objectUrl) {
        reject(new Error("Brakuje lokalnego obrazu."));
        return;
      }
      image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("Nie można odczytać obrazu banera."));
      };
      image.src = record.objectUrl;
    });
  }

  function drawImageFit(ctx, image, box, fit) {
    var imageRatio = image.naturalWidth / image.naturalHeight;
    var boxRatio = box.width / box.height;
    var drawWidth;
    var drawHeight;
    var drawX;
    var drawY;

    if (fit === "contain") {
      if (imageRatio > boxRatio) {
        drawWidth = box.width;
        drawHeight = box.width / imageRatio;
      } else {
        drawHeight = box.height;
        drawWidth = box.height * imageRatio;
      }
    } else if (imageRatio > boxRatio) {
      drawHeight = box.height;
      drawWidth = box.height * imageRatio;
    } else {
      drawWidth = box.width;
      drawHeight = box.width / imageRatio;
    }

    drawX = box.x + (box.width - drawWidth) / 2;
    drawY = box.y + (box.height - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function ellipsizeLine(ctx, text, maxWidth) {
    var raw = String(text || "").trim();
    var suffix = "...";
    var next;

    if (ctx.measureText(raw).width <= maxWidth) {
      return raw;
    }
    while (raw.length > 0) {
      next = raw.replace(/\s*\S+\s*$/, "");
      raw = next && next.length < raw.length ? next : raw.slice(0, -1);
      if (ctx.measureText(raw + suffix).width <= maxWidth) {
        return raw + suffix;
      }
    }
    return suffix;
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";

    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) {
      lines.push(line);
    }
    return lines;
  }

  function fitTextBlock(ctx, text, options) {
    var size = options.startSize;
    var step = Math.max(1, Math.round(options.startSize * 0.045));
    var allLines;
    var visibleLines;
    var lineHeight;
    var availableLines;

    while (size >= options.minSize) {
      setTextFont(ctx, options.weight, size);
      lineHeight = Math.round(size * options.lineRatio);
      availableLines = Math.max(1, Math.min(options.maxLines, Math.floor(options.availableHeight / lineHeight)));
      allLines = wrapLines(ctx, text, options.maxWidth);
      if (allLines.length <= availableLines && allLines.length * lineHeight <= options.availableHeight) {
        return {
          size: size,
          lineHeight: lineHeight,
          lines: allLines,
          truncated: false
        };
      }
      size -= step;
    }

    size = options.minSize;
    setTextFont(ctx, options.weight, size);
    lineHeight = Math.round(size * options.lineRatio);
    availableLines = Math.max(1, Math.min(options.maxLines, Math.floor(options.availableHeight / lineHeight)));
    allLines = wrapLines(ctx, text, options.maxWidth);
    visibleLines = allLines.slice(0, availableLines);
    if (allLines.length > visibleLines.length && visibleLines.length) {
      visibleLines[visibleLines.length - 1] = ellipsizeLine(ctx, visibleLines[visibleLines.length - 1], options.maxWidth);
    }
    return {
      size: size,
      lineHeight: lineHeight,
      lines: visibleLines,
      truncated: allLines.length > visibleLines.length
    };
  }

  function drawLines(ctx, lines, x, y, lineHeight) {
    lines.forEach(function (line, index) {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    return lines.length * lineHeight;
  }

  function fillBackground(ctx, project, banner, width, height) {
    var color = colorFor(project, banner.backgroundPreset);
    var gradient = ctx.createLinearGradient(0, 0, width, height);
    var textColor = readableTextColor(color);

    if (banner.backgroundPreset === "auto") {
      gradient.addColorStop(0, "#f8fafc");
      gradient.addColorStop(1, "#e5e7eb");
    } else {
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, textColor === "#17202b" ? "#f8fafc" : "#0f141b");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return textColor;
  }

  function drawStyle(ctx, project, banner, width, height) {
    var primary = project.brandColors && project.brandColors.primary || "#f47b20";
    if (banner.bannerStyle === "soft-border" || banner.bannerStyle === "premium-accent") {
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = Math.max(4, Math.round(width * 0.004));
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    }
    if (banner.bannerStyle === "premium-accent") {
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, Math.max(12, Math.round(width * 0.012)), height);
    }
  }

  function contentBoxes(layout, width, height) {
    var gap = Math.round(width * 0.035);
    var pad = Math.round(width * 0.055);
    var half = Math.round((width - pad * 2 - gap) / 2);
    var imageBox;
    var textBox;

    if (layout === "image-right") {
      textBox = { x: pad, y: Math.round(height * 0.13), width: half, height: Math.round(height * 0.74) };
      imageBox = { x: pad + half + gap, y: Math.round(height * 0.08), width: half, height: Math.round(height * 0.84) };
    } else {
      imageBox = { x: pad, y: Math.round(height * 0.08), width: half, height: Math.round(height * 0.84) };
      textBox = { x: pad + half + gap, y: Math.round(height * 0.13), width: half, height: Math.round(height * 0.74) };
    }

    if (layout === "panel-overlay") {
      imageBox = { x: 0, y: 0, width: width, height: height };
      textBox = { x: Math.round(width * 0.54), y: Math.round(height * 0.1), width: Math.round(width * 0.38), height: Math.round(height * 0.8), panel: true };
    }
    if (layout === "full-overlay") {
      imageBox = { x: 0, y: 0, width: width, height: height };
      textBox = { x: Math.round(width * 0.1), y: Math.round(height * 0.13), width: Math.round(width * 0.8), height: Math.round(height * 0.74), overlay: true };
    }

    return { imageBox: imageBox, textBox: textBox };
  }

  function textSafeBox(box, width) {
    var sidePad = box.panel || box.overlay ? Math.round(width * 0.03) : Math.round(width * 0.012);
    var topPad = box.panel || box.overlay ? Math.round(width * 0.024) : Math.round(width * 0.006);
    var bottomPad = box.panel || box.overlay ? Math.round(width * 0.028) : Math.round(width * 0.012);
    return {
      x: box.x + sidePad,
      y: box.y + topPad,
      width: Math.max(1, box.width - sidePad * 2),
      height: Math.max(1, box.height - topPad - bottomPad)
    };
  }

  function drawTextPanel(ctx, box, layout) {
    if (!box.panel && !box.overlay) {
      return;
    }
    ctx.fillStyle = layout === "full-overlay" ? "rgba(15,20,27,0.58)" : "rgba(15,20,27,0.78)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }

  function drawBannerText(ctx, project, banner, box, baseTextColor) {
    var width = ctx.canvas.width;
    var safe = textSafeBox(box, width);
    var x = banner.textAlign === "center" ? safe.x + safe.width / 2 : safe.x;
    var y = safe.y;
    var bottom = safe.y + safe.height;
    var spacing = Math.max(6, Math.round(width * 0.008));
    var textColor = box.panel || box.overlay ? "#fff7ed" : baseTextColor;
    var bullets = Array.isArray(banner.bullets) ? banner.bullets.filter(function (item) { return String(item || "").trim(); }) : [];
    var headlineSize = Math.round(width * 0.042);
    var supportingSize = Math.round(width * 0.018);
    var bulletSize = Math.round(width * 0.016);
    var fit;
    var bulletLineHeight;
    var availableBulletLines;
    var renderedBullets = 0;
    var extraRendered = false;

    ctx.save();
    ctx.beginPath();
    ctx.rect(safe.x, safe.y, safe.width, safe.height);
    ctx.clip();
    ctx.textAlign = banner.textAlign === "center" ? "center" : "left";
    ctx.textBaseline = "top";

    ctx.fillStyle = textColor;
    fit = fitTextBlock(ctx, banner.headline, {
      weight: "900",
      startSize: headlineSize,
      minSize: Math.round(width * 0.026),
      lineRatio: 1.08,
      maxWidth: safe.width,
      maxLines: 2,
      availableHeight: Math.max(1, bottom - y)
    });
    setTextFont(ctx, "900", fit.size);
    y += drawLines(ctx, fit.lines, x, y, fit.lineHeight);

    if (banner.supportingText && bottom - y > Math.round(supportingSize * 1.25)) {
      y += Math.min(spacing, Math.max(0, bottom - y));
      ctx.fillStyle = box.panel || box.overlay ? "#f1f5f9" : textColor;
      fit = fitTextBlock(ctx, banner.supportingText, {
        weight: "700",
        startSize: supportingSize,
        minSize: Math.round(width * 0.0125),
        lineRatio: 1.25,
        maxWidth: safe.width,
        maxLines: 3,
        availableHeight: Math.max(1, bottom - y)
      });
      setTextFont(ctx, "700", fit.size);
      y += drawLines(ctx, fit.lines, x, y, fit.lineHeight);
    }

    if (bullets.length && bottom - y > Math.round(width * 0.015)) {
      while (bulletSize >= Math.round(width * 0.0115)) {
        setTextFont(ctx, "700", bulletSize);
        bulletLineHeight = Math.round(bulletSize * 1.25);
        availableBulletLines = Math.min(3, Math.floor((bottom - y - spacing) / bulletLineHeight));
        if (availableBulletLines > 0) {
          break;
        }
        bulletSize -= Math.max(1, Math.round(width * 0.001));
      }
      if (availableBulletLines > 0) {
        y += spacing;
        ctx.fillStyle = box.panel || box.overlay ? "#f8fafc" : textColor;
        setTextFont(ctx, "700", bulletSize);
        bullets.slice(0, availableBulletLines).forEach(function (bullet) {
          ctx.fillText(ellipsizeLine(ctx, "- " + bullet, safe.width), x, y);
          y += bulletLineHeight;
          renderedBullets += 1;
        });
      }
    }

    if (banner.extraLine && bottom - y > Math.round(width * 0.013) + spacing) {
      y += spacing;
      fit = fitTextBlock(ctx, banner.extraLine, {
        weight: "800",
        startSize: Math.round(width * 0.015),
        minSize: Math.round(width * 0.0115),
        lineRatio: 1.18,
        maxWidth: safe.width,
        maxLines: 1,
        availableHeight: Math.max(1, bottom - y)
      });
      if (fit.lines.length && fit.lines[0]) {
        ctx.fillStyle = project.brandColors && project.brandColors.secondary || "#e9ad42";
        setTextFont(ctx, "800", fit.size);
        drawLines(ctx, fit.lines, x, y, fit.lineHeight);
        extraRendered = true;
      }
    }
    ctx.restore();

    return {
      extraRendered: extraRendered,
      renderedBullets: renderedBullets,
      sourceBulletCount: bullets.length
    };
  }

  function render(canvas, project, imageRecord) {
    var banner = project.modules && project.modules.banner || {};
    var size = sizeFor(banner.canvasSize);
    var ctx = canvas.getContext("2d");

    canvas.width = size.width;
    canvas.height = size.height;

    if (!imageRecord || !imageRecord.objectUrl) {
      return renderPlaceholder(canvas, "Wybierz plik lokalny ponownie");
    }

    return loadImage(imageRecord).then(function (image) {
      var boxes;
      var textColor;
      var textFit;
      ctx.clearRect(0, 0, size.width, size.height);
      textColor = fillBackground(ctx, project, banner, size.width, size.height);
      boxes = contentBoxes(banner.layoutPreset, size.width, size.height);
      drawImageFit(ctx, image, boxes.imageBox, banner.imageFit);

      if (banner.layoutPreset === "full-overlay") {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, size.width, size.height);
      }

      drawTextPanel(ctx, boxes.textBox, banner.layoutPreset);
      textFit = drawBannerText(ctx, project, banner, boxes.textBox, textColor);
      drawStyle(ctx, project, banner, size.width, size.height);
      return { canvas: canvas, textFit: textFit };
    }).catch(function (error) {
      return renderPlaceholder(canvas, error.message);
    });
  }

  function renderPlaceholder(canvas, message) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width || 970;
    var height = canvas.height || 300;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#121922";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#344152";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.fillStyle = "#c7d0dd";
    ctx.font = "800 " + Math.round(width * 0.026) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message || "Brakuje danych banera", width / 2, height / 2);
    return Promise.resolve({ canvas: canvas, textFit: { extraRendered: false, renderedBullets: 0, sourceBulletCount: 0 } });
  }

  namespace.BannerRenderer = {
    render: render,
    renderPlaceholder: renderPlaceholder,
    sizeFor: sizeFor,
    sizes: SIZES
  };

  global.FenixAPlus = namespace;
}(window));
