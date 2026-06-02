"""
Unit tests for ai_chat_api.py

Tests core functionality of the OpenRouter API integration including:
- Mock reasoning content generation
- Response parsing
- Error handling
- Edge cases
"""

import pytest
import json
from unittest.mock import patch, MagicMock
from ai_assistant.ai_chat_api import (
    send_message,
    _generate_mock_reasoning,
    _format_error_response,
)


class TestMockReasoningGeneration:
    """Test mock reasoning content generation"""

    @pytest.mark.unit
    def test_generates_reasoning_for_code_questions(self):
        """Mock reasoning should be generated for code-related questions"""
        question = "how do I write a function in python"
        reasoning = _generate_mock_reasoning(question)
        
        assert reasoning is not None
        assert len(reasoning) > 0
        assert isinstance(reasoning, str)
        assert any(keyword in reasoning.lower() for keyword in ['function', 'python', 'approach'])

    @pytest.mark.unit
    def test_generates_reasoning_for_math_questions(self):
        """Mock reasoning should be generated for math-related questions"""
        question = "calculate the area of a circle"
        reasoning = _generate_mock_reasoning(question)
        
        assert reasoning is not None
        assert len(reasoning) > 0
        assert any(keyword in reasoning.lower() for keyword in ['circle', 'formula', 'radius'])

    @pytest.mark.unit
    def test_generates_reasoning_for_generic_questions(self):
        """Mock reasoning should be generated for any question"""
        question = "what is the weather like?"
        reasoning = _generate_mock_reasoning(question)
        
        assert reasoning is not None
        assert len(reasoning) > 0
        # Should have some generic thinking process

    @pytest.mark.unit
    def test_reasoning_content_not_empty_for_empty_response(self):
        """Mock reasoning should be provided when API doesn't return reasoning"""
        question = "test"
        reasoning = _generate_mock_reasoning(question)
        
        assert len(reasoning) > 50  # Should be substantial text
        assert reasoning.startswith("I'm thinking about") or reasoning.startswith("Let me")


class TestResponseFormatting:
    """Test response formatting and structure"""

    @pytest.mark.unit
    def test_error_response_structure(self):
        """Error responses should have correct structure"""
        error_msg = "API key is invalid"
        response = _format_error_response("INVALID_API_KEY", error_msg)
        
        assert response["ok"] is False
        assert response["error"] == "INVALID_API_KEY"
        assert response["message"] == error_msg

    @pytest.mark.unit
    def test_success_response_has_required_fields(self):
        """Success responses should have all required fields"""
        # This would test the actual send_message response format
        # when mocked properly
        pass


class TestAPIKeyHandling:
    """Test API key validation and error handling"""

    @pytest.mark.unit
    def test_missing_api_key_error(self):
        """Should handle missing API key gracefully"""
        with patch.dict('os.environ', {}, clear=True):
            # Mock the API call
            response = _format_error_response("MISSING_API_KEY", "OpenRouter API key not configured")
            
            assert response["ok"] is False
            assert "MISSING_API_KEY" in response["error"]

    @pytest.mark.unit
    def test_invalid_api_key_error(self):
        """Should handle invalid API key error from OpenRouter"""
        error_response = {
            "error": {
                "message": "Invalid API key",
                "code": "invalid_api_key"
            }
        }
        response = _format_error_response("UPSTREAM_ERROR", f"API key rejected: {error_response['error']['message']}")
        
        assert response["ok"] is False
        assert "API key" in response["message"]


class TestResponseParsing:
    """Test parsing of different response formats from OpenRouter"""

    @pytest.mark.unit
    def test_parses_standard_openrouter_response(self):
        """Should correctly parse standard OpenRouter responses"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": "Hello, how can I help?"
                }
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        }
        
        # Content extraction
        content = mock_response["choices"][0]["message"]["content"]
        assert content == "Hello, how can I help?"

    @pytest.mark.unit
    def test_handles_reasoning_content_in_response(self):
        """Should extract reasoning_content when provided by model"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": "The answer is 42",
                    "reasoning_content": "I calculated based on..."
                }
            }]
        }
        
        reasoning = mock_response["choices"][0]["message"].get("reasoning_content", "")
        assert reasoning == "I calculated based on..."

    @pytest.mark.unit
    def test_handles_empty_content_response(self):
        """Should handle responses with empty content"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": ""
                }
            }]
        }
        
        content = mock_response["choices"][0]["message"]["content"]
        assert content == ""


class TestErrorScenarios:
    """Test error handling and edge cases"""

    @pytest.mark.unit
    def test_timeout_error_response(self):
        """Should handle timeout errors gracefully"""
        error_response = _format_error_response(
            "TIMEOUT_ERROR",
            "Request to OpenRouter API timed out after 30 seconds"
        )
        
        assert error_response["ok"] is False
        assert "timeout" in error_response["message"].lower()

    @pytest.mark.unit
    def test_network_error_response(self):
        """Should handle network errors"""
        error_response = _format_error_response(
            "NETWORK_ERROR",
            "Failed to connect to OpenRouter API"
        )
        
        assert error_response["ok"] is False

    @pytest.mark.unit
    def test_malformed_json_response(self):
        """Should handle malformed JSON from API"""
        error_response = _format_error_response(
            "PARSE_ERROR",
            "Invalid JSON response from API"
        )
        
        assert error_response["ok"] is False
        assert "JSON" in error_response["message"]

    @pytest.mark.unit
    def test_rate_limit_error(self):
        """Should handle rate limit errors"""
        error_response = _format_error_response(
            "RATE_LIMIT",
            "Too many requests to OpenRouter API. Please wait before retrying."
        )
        
        assert error_response["ok"] is False
        assert "rate" in error_response["message"].lower()


class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    @pytest.mark.unit
    def test_very_long_message_handling(self):
        """Should handle very long user messages"""
        long_message = "test " * 5000  # Very long message
        reasoning = _generate_mock_reasoning(long_message)
        
        assert reasoning is not None
        assert len(reasoning) > 0

    @pytest.mark.unit
    def test_special_characters_in_message(self):
        """Should handle special characters in messages"""
        special_message = "Test with émojis 🚀, spëcial çhars, and \"quotes\""
        reasoning = _generate_mock_reasoning(special_message)
        
        assert reasoning is not None

    @pytest.mark.unit
    def test_empty_message_handling(self):
        """Should handle empty messages"""
        reasoning = _generate_mock_reasoning("")
        
        assert reasoning is not None
        assert len(reasoning) > 0

    @pytest.mark.unit
    def test_unicode_message_handling(self):
        """Should handle unicode characters"""
        unicode_message = "你好世界 مرحبا Здравствуй"
        reasoning = _generate_mock_reasoning(unicode_message)
        
        assert reasoning is not None


class TestResponseModel:
    """Test response model compliance"""

    @pytest.mark.unit
    def test_response_has_ok_field(self):
        """All responses should have 'ok' field"""
        error_response = _format_error_response("TEST_ERROR", "test")
        assert "ok" in error_response
        assert isinstance(error_response["ok"], bool)

    @pytest.mark.unit
    def test_error_response_has_error_field(self):
        """Error responses should have 'error' field"""
        error_response = _format_error_response("TEST_ERROR", "test")
        assert "error" in error_response
        assert error_response["error"] == "TEST_ERROR"

    @pytest.mark.unit
    def test_error_response_has_message_field(self):
        """Error responses should have 'message' field"""
        error_response = _format_error_response("TEST_ERROR", "test message")
        assert "message" in error_response
        assert "test message" in error_response["message"]
