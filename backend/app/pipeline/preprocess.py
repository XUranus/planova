import tempfile
from pathlib import Path

import cv2
import numpy as np


def preprocess_floor_plan(input_path: str) -> str:
    """
    Preprocess a floor plan image for VLM parsing.
    Returns the path to the processed image.
    """
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Could not read image: {input_path}")

    # Convert to grayscale for processing
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Auto-rotate correction using Hough line detection
    img = _correct_rotation(img, gray)

    # Crop to content area
    img = _crop_content(img)

    # Resize if too large
    img = _resize_if_large(img, max_size=2048)

    # Save processed image
    output_path = _save_processed(input_path, img)
    return output_path


def _correct_rotation(img: np.ndarray, gray: np.ndarray) -> np.ndarray:
    """Detect dominant lines and correct rotation angle."""
    try:
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

        if lines is None or len(lines) == 0:
            return img

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Only consider near-horizontal/vertical lines
            if abs(angle) < 45 or abs(angle - 90) < 45 or abs(angle + 90) < 45:
                angles.append(angle)

        if not angles:
            return img

        median_angle = np.median(angles)

        # Only correct small rotations
        if abs(median_angle) > 5 and abs(median_angle) < 85:
            return img

        if abs(median_angle) < 2:
            return img

        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        pass

    return img


def _crop_content(img: np.ndarray) -> np.ndarray:
    """Crop to the content area, removing large white borders."""
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Threshold to find non-white areas
        _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
        # Dilate to connect nearby elements
        kernel = np.ones((5, 5), np.uint8)
        dilated = cv2.dilate(thresh, kernel, iterations=2)
        # Find bounding box
        coords = cv2.findNonZero(dilated)
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            # Add padding
            pad = 20
            x = max(0, x - pad)
            y = max(0, y - pad)
            w = min(img.shape[1] - x, w + 2 * pad)
            h = min(img.shape[0] - y, h + 2 * pad)
            if w > 100 and h > 100:
                img = img[y : y + h, x : x + w]
    except Exception:
        pass

    return img


def _resize_if_large(img: np.ndarray, max_size: int = 2048) -> np.ndarray:
    """Resize image if its longest side exceeds max_size."""
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_size:
        return img

    scale = max_size / longest
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _save_processed(original_path: str, img: np.ndarray) -> str:
    """Save the processed image to a temporary file."""
    src = Path(original_path)
    suffix = src.suffix or ".png"
    fd, output_path = tempfile.mkstemp(suffix=suffix, prefix="planova_processed_")
    import os
    os.close(fd)
    cv2.imwrite(output_path, img)
    return output_path
